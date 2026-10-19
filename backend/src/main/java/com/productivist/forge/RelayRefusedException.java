package com.productivist.forge;

/** The relay will not make this request. The message is fixed text, never request data (it may reach a log). */
final class RelayRefusedException extends RuntimeException {

    RelayRefusedException(String message) {
        super(message);
    }
}
