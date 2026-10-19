package com.productivist.forge;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.GZIPInputStream;

import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * A minimal HTTP/1.1 GET client that connects to an address the caller already validated. The JDK clients resolve the
 * name themselves, which would leave a window for DNS rebinding between the guard's check and the connection; here the
 * socket goes to the pinned address, TLS still uses the original host name for SNI and certificate verification, and
 * redirects are not followed (a 3xx comes back as it is). One overall deadline covers connect, handshake and reading,
 * and the body is cut off at a size cap. Nothing here logs.
 */
final class PinnedHttpClient {

    record Response(int status, Map<String, String> headers, byte[] body) {}

    /** The response was larger than the cap. */
    static final class TooLargeException extends IOException {
        TooLargeException() {
            super("Response too large");
        }
    }

    private static final int MAX_HEADER_BYTES = 64 * 1024;
    private static final int MAX_HEADER_LINES = 200;
    private static final int CONNECT_TIMEOUT_MS = 5000;

    private PinnedHttpClient() {}

    static Response get(InetAddress address, ForgeRelayGuard.Target target, Map<String, String> headers, long timeoutMs, int maxBytes)
            throws IOException {
        long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(address, target.port()), (int) Math.min(CONNECT_TIMEOUT_MS, timeoutMs));
            socket.setSoTimeout((int) Math.max(1, remainingMs(deadline)));
            Socket io = socket;
            if (target.tls()) {
                SSLSocket tls = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(socket, target.host(), target.port(), true);
                SSLParameters params = tls.getSSLParameters();
                // Certificate and host name are checked against the name the user typed, not the pinned address.
                params.setEndpointIdentificationAlgorithm("HTTPS");
                if (!isIpLiteral(target.host())) params.setServerNames(List.of(new SNIHostName(target.host())));
                tls.setSSLParameters(params);
                tls.startHandshake();
                io = tls;
            }
            return exchange(io, target, headers, deadline, maxBytes);
        } finally {
            try {
                socket.close();
            } catch (IOException ignored) {
                // closing a socket that is already gone
            }
        }
    }

    private static Response exchange(Socket io, ForgeRelayGuard.Target target, Map<String, String> headers, long deadline, int maxBytes)
            throws IOException {
        StringBuilder request = new StringBuilder(256)
                .append("GET ").append(target.pathAndQuery()).append(" HTTP/1.1\r\n")
                .append("Host: ").append(target.host());
        boolean defaultPort = target.port() == (target.tls() ? 443 : 80);
        if (!defaultPort) request.append(':').append(target.port());
        request.append("\r\nConnection: close\r\nAccept-Encoding: gzip, identity\r\nUser-Agent: Productivist-ForgeRelay\r\n");
        for (Map.Entry<String, String> h : headers.entrySet()) request.append(h.getKey()).append(": ").append(h.getValue()).append("\r\n");
        request.append("\r\n");
        OutputStream out = io.getOutputStream();
        out.write(request.toString().getBytes(StandardCharsets.ISO_8859_1));
        out.flush();

        InputStream in = new DeadlineInputStream(io, deadline);
        String statusLine = readLine(in);
        String[] parts = statusLine.split(" ", 3);
        if (parts.length < 2 || !parts[0].startsWith("HTTP/1.")) throw new IOException("Bad status line");
        int status;
        try {
            status = Integer.parseInt(parts[1]);
        } catch (NumberFormatException e) {
            throw new IOException("Bad status line");
        }
        Map<String, String> responseHeaders = new LinkedHashMap<>();
        int total = statusLine.length();
        for (int lines = 0;; lines++) {
            String line = readLine(in);
            if (line.isEmpty()) break;
            total += line.length();
            if (lines > MAX_HEADER_LINES || total > MAX_HEADER_BYTES) throw new IOException("Headers too large");
            int colon = line.indexOf(':');
            if (colon <= 0) continue;
            String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
            String value = line.substring(colon + 1).trim();
            responseHeaders.merge(name, value, (a, b) -> a + ", " + b);
        }
        byte[] body = readBody(in, responseHeaders, status, maxBytes);
        if ("gzip".equalsIgnoreCase(responseHeaders.get("content-encoding"))) {
            body = readAllCapped(new GZIPInputStream(new java.io.ByteArrayInputStream(body)), maxBytes);
            responseHeaders.remove("content-encoding");
        }
        return new Response(status, responseHeaders, body);
    }

    private static byte[] readBody(InputStream in, Map<String, String> headers, int status, int maxBytes) throws IOException {
        if (status == 204 || status == 304 || (status >= 100 && status < 200)) return new byte[0];
        String encoding = headers.getOrDefault("transfer-encoding", "").toLowerCase(Locale.ROOT);
        if (encoding.contains("chunked")) {
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            while (true) {
                String sizeLine = readLine(in);
                int semicolon = sizeLine.indexOf(';');
                String hex = (semicolon >= 0 ? sizeLine.substring(0, semicolon) : sizeLine).trim();
                int size;
                try {
                    size = Integer.parseInt(hex, 16);
                } catch (NumberFormatException e) {
                    throw new IOException("Bad chunk");
                }
                if (size < 0) throw new IOException("Bad chunk");
                if (size == 0) break;
                if ((long) body.size() + size > maxBytes) throw new TooLargeException();
                copyExactly(in, body, size);
                readLine(in); // the CRLF that ends the chunk
            }
            return body.toByteArray();
        }
        String length = headers.get("content-length");
        if (length != null) {
            long n;
            try {
                n = Long.parseLong(length.trim());
            } catch (NumberFormatException e) {
                throw new IOException("Bad content length");
            }
            if (n < 0) throw new IOException("Bad content length");
            if (n > maxBytes) throw new TooLargeException();
            ByteArrayOutputStream body = new ByteArrayOutputStream((int) n);
            copyExactly(in, body, (int) n);
            return body.toByteArray();
        }
        return readAllCapped(in, maxBytes);
    }

    private static byte[] readAllCapped(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) {
            if ((long) body.size() + read > maxBytes) throw new TooLargeException();
            body.write(buffer, 0, read);
        }
        return body.toByteArray();
    }

    private static void copyExactly(InputStream in, ByteArrayOutputStream out, int count) throws IOException {
        byte[] buffer = new byte[8192];
        int left = count;
        while (left > 0) {
            int read = in.read(buffer, 0, Math.min(buffer.length, left));
            if (read == -1) throw new IOException("Truncated body");
            out.write(buffer, 0, read);
            left -= read;
        }
    }

    /** One CRLF-terminated line as text (without the line end), bounded so a peer cannot make it grow forever. */
    private static String readLine(InputStream in) throws IOException {
        StringBuilder line = new StringBuilder();
        while (true) {
            int c = in.read();
            if (c == -1) {
                if (line.length() == 0) throw new IOException("Unexpected end of response");
                break;
            }
            if (c == '\n') break;
            if (c != '\r') line.append((char) c);
            if (line.length() > MAX_HEADER_BYTES) throw new IOException("Line too long");
        }
        return line.toString();
    }

    private static boolean isIpLiteral(String host) {
        return host.matches("^[0-9.]+$") || host.contains(":");
    }

    private static long remainingMs(long deadline) {
        return (deadline - System.nanoTime()) / 1_000_000L;
    }

    /** Reads from the socket with the time left until the overall deadline as the read timeout. */
    private static final class DeadlineInputStream extends InputStream {
        private final Socket socket;
        private final InputStream in;
        private final long deadline;

        DeadlineInputStream(Socket socket, long deadline) throws IOException {
            this.socket = socket;
            this.in = new java.io.BufferedInputStream(socket.getInputStream(), 8192);
            this.deadline = deadline;
        }

        private void arm() throws IOException {
            long left = remainingMs(deadline);
            if (left <= 0) throw new java.net.SocketTimeoutException("Deadline");
            socket.setSoTimeout((int) Math.min(left, Integer.MAX_VALUE));
        }

        @Override
        public int read() throws IOException {
            arm();
            return in.read();
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            arm();
            return in.read(b, off, len);
        }
    }
}
