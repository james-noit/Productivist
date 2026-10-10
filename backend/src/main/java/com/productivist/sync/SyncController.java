package com.productivist.sync;

import jakarta.validation.Valid;

import com.productivist.sync.SyncDtos.PullResponse;
import com.productivist.sync.SyncDtos.PushRequest;
import com.productivist.sync.SyncDtos.PushResponse;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final SyncService sync;

    public SyncController(SyncService sync) {
        this.sync = sync;
    }

    /** Rows changed after {@code since} (0 = everything). Store the returned cursor for the next pull. */
    @GetMapping
    public PullResponse pull(@AuthenticationPrincipal Long userId, @RequestParam(defaultValue = "0") long since) {
        return sync.pull(userId, since);
    }

    /** Upserts a batch of local changes (including tombstones) with last-write-wins on updatedAt. */
    @PostMapping
    public PushResponse push(@AuthenticationPrincipal Long userId, @Valid @RequestBody PushRequest request) {
        return new PushResponse(sync.push(userId, request));
    }
}
