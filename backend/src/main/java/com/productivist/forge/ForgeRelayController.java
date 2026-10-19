package com.productivist.forge;

import com.productivist.forge.ForgeRelayService.RelayRequest;
import com.productivist.forge.ForgeRelayService.RelayResponse;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/forge/relay}: signed-in users only (every {@code /api/**} route but login and signup needs a bearer
 * token, see {@code SecurityConfig}). Body {@code {url, method?, headers?}}, answer {@code {status, headers, body}} with the
 * forge's own status inside; the relay's own refusals and failures use HTTP statuses of their own.
 */
@RestController
@RequestMapping("/api/forge")
public class ForgeRelayController {

    private final ForgeRelayService relay;

    public ForgeRelayController(ForgeRelayService relay) {
        this.relay = relay;
    }

    @PostMapping("/relay")
    public RelayResponse relay(@RequestBody RelayRequest request) {
        return relay.relay(request);
    }
}
