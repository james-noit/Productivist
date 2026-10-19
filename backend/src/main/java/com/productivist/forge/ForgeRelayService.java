package com.productivist.forge;

import java.io.IOException;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Fetches one allowlisted forge API URL for a signed-in user (the Git forge import, for servers that refuse
 * cross-origin requests from the browser). The user's personal access token passes through in the
 * {@code Authorization} header, in transit only: nothing about a request or its answer is stored or logged, and every
 * error below carries fixed text. The rules live in {@link ForgeRelayGuard}.
 */
@Service
public class ForgeRelayService {

    private static final Logger log = LoggerFactory.getLogger(ForgeRelayService.class);
    private static final long TIMEOUT_MS = 10_000;
    private static final int MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
    private static final int MAX_CONCURRENT = 16;
    /** Response headers handed back to the page (lower case): pagination, caching and rate-limit information. */
    private static final Set<String> RESPONSE_HEADERS = Set.of(
            "link", "etag", "content-type", "retry-after",
            "x-next-page", "x-prev-page", "x-page", "x-per-page", "x-total", "x-total-pages", "x-total-count",
            "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset");

    public record RelayRequest(String url, String method, Map<String, String> headers) {}

    public record RelayResponse(int status, Map<String, String> headers, String body) {}

    private final boolean unsafeDev;
    private final ForgeRelayGuard guard;
    private final Semaphore slots = new Semaphore(MAX_CONCURRENT);

    public ForgeRelayService(
            @Value("${app.forge-relay.unsafe-dev-allow-http-and-private-addresses:false}") boolean unsafeDev) {
        this.unsafeDev = unsafeDev;
        this.guard = new ForgeRelayGuard(unsafeDev);
    }

    @PostConstruct
    void warnIfUnsafe() {
        if (unsafeDev) {
            log.warn("FORGE_RELAY_UNSAFE_DEV_ALLOW_HTTP_AND_PRIVATE is on: the forge relay accepts http and private addresses. "
                    + "Development only; never set this in production.");
        }
    }

    public RelayResponse relay(RelayRequest request) {
        if (request == null || (request.method() != null && !"GET".equals(request.method()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only GET is relayed");
        }
        ForgeRelayGuard.Target target;
        Map<String, String> headers;
        try {
            target = guard.parse(request.url());
            headers = guard.filterHeaders(request.headers());
        } catch (RelayRefusedException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        if (!slots.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Relay busy");
        try {
            InetAddress address = guard.resolve(target.host());
            PinnedHttpClient.Response response = PinnedHttpClient.get(address, target, headers, TIMEOUT_MS, MAX_RESPONSE_BYTES);
            Map<String, String> forwarded = new LinkedHashMap<>();
            response.headers().forEach((name, value) -> {
                if (RESPONSE_HEADERS.contains(name)) forwarded.put(name, value);
            });
            return new RelayResponse(response.status(), forwarded, new String(response.body(), StandardCharsets.UTF_8));
        } catch (RelayRefusedException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (PinnedHttpClient.TooLargeException e) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Response too large");
        } catch (UnknownHostException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unknown host");
        } catch (SocketTimeoutException e) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "Timed out");
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Upstream error");
        } finally {
            slots.release();
        }
    }
}
