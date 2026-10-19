package com.productivist.forge;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Decides what the forge relay may fetch: which URLs, which headers and which addresses. The relay carries a user's
 * personal access token to an address the user typed, so it must not become an open proxy or a way into the server's
 * own network: https only, an API path allowlist, no credentials in the URL, and a destination that is a public
 * address after DNS (every address the name resolves to is checked, and the caller then connects to the address it
 * validated, so a second lookup cannot return a different one).
 *
 * <p>{@code unsafeDev} lifts the scheme and address rules so the relay can be tried against a forge on localhost. It is
 * for development only and is off unless the {@code FORGE_RELAY_UNSAFE_DEV_ALLOW_HTTP_AND_PRIVATE} variable is set.
 */
final class ForgeRelayGuard {

    /** What a validated URL boils down to. */
    record Target(String host, int port, boolean tls, String pathAndQuery) {}

    private static final Pattern API_PATH = Pattern.compile("^/api/(v1|v3|v4)/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$");
    private static final Pattern ANY_PATH = Pattern.compile("^/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$");
    private static final Pattern QUERY = Pattern.compile("^[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*$");
    private static final Pattern HOST = Pattern.compile("^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$");
    private static final String GITHUB_API_HOST = "api.github.com";
    private static final int MAX_URL = 2000;
    private static final int MAX_HEADER_VALUE = 4000;

    /** The only request headers that are forwarded (lower case). */
    static final Set<String> REQUEST_HEADERS = Set.of("authorization", "accept", "if-none-match", "content-type");

    private final boolean unsafeDev;

    ForgeRelayGuard(boolean unsafeDev) {
        this.unsafeDev = unsafeDev;
    }

    Target parse(String url) {
        if (url == null || url.length() > MAX_URL) throw new RelayRefusedException("Invalid URL");
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            throw new RelayRefusedException("Invalid URL");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        boolean tls = scheme.equals("https");
        if (!tls && !(unsafeDev && scheme.equals("http"))) throw new RelayRefusedException("Only https is allowed");
        if (uri.getRawUserInfo() != null || uri.getRawFragment() != null) throw new RelayRefusedException("Invalid URL");
        String host = uri.getHost() == null ? null : uri.getHost().toLowerCase(Locale.ROOT);
        if (host == null || host.startsWith("[") || !HOST.matcher(host).matches()) throw new RelayRefusedException("Invalid host");
        int port = uri.getPort() == -1 ? (tls ? 443 : 80) : uri.getPort();
        if (port < 1 || port > 65535) throw new RelayRefusedException("Invalid port");
        String path = uri.getRawPath();
        boolean github = host.equals(GITHUB_API_HOST);
        if (path == null || !(github ? ANY_PATH : API_PATH).matcher(path).matches() || hasDotSegment(path)) {
            throw new RelayRefusedException("Path not allowed");
        }
        if (github && port != 443) throw new RelayRefusedException("Invalid port");
        String query = uri.getRawQuery();
        if (query != null && (query.length() > 1500 || !QUERY.matcher(query).matches())) throw new RelayRefusedException("Invalid query");
        return new Target(host, port, tls, query == null ? path : path + "?" + query);
    }

    /** Dot segments, literal or percent-encoded, and encoded backslashes, could climb out of the allowlisted prefix. */
    private static boolean hasDotSegment(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        for (String segment : lower.split("/")) {
            String s = segment.replace("%2e", ".");
            if (s.equals(".") || s.equals("..")) return true;
        }
        return lower.contains("%5c");
    }

    /** Keeps only the allowed headers; a value with control characters (header injection) is refused outright. */
    Map<String, String> filterHeaders(Map<String, String> headers) {
        Map<String, String> kept = new java.util.LinkedHashMap<>();
        if (headers == null) return kept;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            String name = entry.getKey() == null ? "" : entry.getKey().toLowerCase(Locale.ROOT);
            if (!REQUEST_HEADERS.contains(name)) continue;
            String value = entry.getValue();
            if (value == null || value.length() > MAX_HEADER_VALUE) throw new RelayRefusedException("Invalid header");
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                if ((c < 0x20 && c != '\t') || c == 0x7f || c > 0xff) throw new RelayRefusedException("Invalid header");
            }
            kept.put(name, value);
        }
        return kept;
    }

    /** Resolves the host and returns the address to connect to; every address it resolves to must be allowed. */
    InetAddress resolve(String host) throws UnknownHostException {
        InetAddress[] all = InetAddress.getAllByName(host);
        if (all.length == 0) throw new UnknownHostException(host);
        List<InetAddress> allowed = new ArrayList<>();
        for (InetAddress address : all) {
            if (!unsafeDev && isForbidden(address)) throw new RelayRefusedException("Address not allowed");
            allowed.add(address);
        }
        // Prefer IPv4: the relay's own egress is more often v4 than v6.
        return allowed.stream().filter(a -> !(a instanceof Inet6Address)).findFirst().orElse(allowed.get(0));
    }

    /** Loopback, private, link-local (cloud metadata included), CGNAT, multicast, reserved and documentation ranges, v4 and v6. */
    static boolean isForbidden(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) {
            return true;
        }
        byte[] b = address.getAddress();
        if (b.length == 4) return forbiddenV4(b);
        // IPv6.
        int first = b[0] & 0xff;
        if ((first & 0xfe) == 0xfc) return true;                       // fc00::/7 unique local (fd00:ec2::254 metadata too)
        if (first == 0xfe && (b[1] & 0xc0) == 0x80) return true;       // fe80::/10 link local
        if (first == 0xff) return true;                                // ff00::/8 multicast
        if (first == 0x20 && b[1] == 0x01 && b[2] == 0x0d && (b[3] & 0xff) == 0xb8) return true; // 2001:db8::/32 documentation
        if (first == 0x20 && b[1] == 0x02) return forbiddenV4(new byte[] {b[2], b[3], b[4], b[5]}); // 6to4 embeds a v4 address
        if (first == 0x00 && b[1] == 0x64 && (b[2] & 0xff) == 0xff && b[3] == (byte) 0x9b) {         // 64:ff9b::/96 NAT64
            return forbiddenV4(new byte[] {b[12], b[13], b[14], b[15]});
        }
        boolean zeroPrefix = true;
        for (int i = 0; i < 12; i++) if (b[i] != 0) zeroPrefix = false;
        if (zeroPrefix) return forbiddenV4(new byte[] {b[12], b[13], b[14], b[15]});               // ::a.b.c.d (deprecated v4-compatible)
        return false;
    }

    private static boolean forbiddenV4(byte[] b) {
        int a = b[0] & 0xff;
        int c = b[1] & 0xff;
        int d = b[2] & 0xff;
        if (a == 0 || a == 10 || a == 127) return true;                // "this" network, private, loopback
        if (a == 100 && (c & 0xc0) == 64) return true;                 // 100.64.0.0/10 carrier-grade NAT
        if (a == 169 && c == 254) return true;                         // link local, cloud metadata
        if (a == 172 && (c & 0xf0) == 16) return true;                 // 172.16.0.0/12
        if (a == 192 && c == 168) return true;                         // 192.168.0.0/16
        if (a == 192 && c == 0 && (d == 0 || d == 2)) return true;     // 192.0.0.0/24 and 192.0.2.0/24
        if (a == 198 && (c == 18 || c == 19)) return true;             // 198.18.0.0/15 benchmarking
        if (a == 198 && c == 51 && d == 100) return true;              // 198.51.100.0/24 documentation
        if (a == 203 && c == 0 && d == 113) return true;               // 203.0.113.0/24 documentation
        return a >= 224;                                               // multicast, reserved, broadcast
    }
}
