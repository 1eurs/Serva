package com.cafeqr.common.exception;

import com.cafeqr.common.api.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.io.IOException;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponse<Void>> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.getStatus())
                .body(ApiResponse.error(ex.getMessage(), ex.getErrorCode().name()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::formatFieldError)
                .collect(Collectors.joining("; "));
        if (message.isBlank()) {
            message = "Validation failed";
        }
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(message, ErrorCode.VALIDATION_ERROR.name()));
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadCredentials(BadCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error("Invalid username or password", ErrorCode.INVALID_CREDENTIALS.name()));
    }

    @ExceptionHandler(DisabledException.class)
    public ResponseEntity<ApiResponse<Void>> handleDisabled(DisabledException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error(
                        "Your account isn't active yet. If you just signed up, we'll enable it "
                                + "once your bank transfer is confirmed.",
                        ErrorCode.ACCOUNT_DISABLED.name()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("Access denied", ErrorCode.ACCESS_DENIED.name()));
    }

    /**
     * An unrouted URL.
     *
     * <p>{@link NoResourceFoundException} rides along because that is what Spring Boot 3
     * actually throws once the static-resource handler has had its turn — it is not a
     * {@link NoHandlerFoundException}, so it used to fall through to the catch-all below and
     * come back as a 500 with an ERROR-level stack trace. Every mistyped path, every client
     * still calling an endpoint that has since been removed, read as a server fault.
     */
    @ExceptionHandler({ NoHandlerFoundException.class, NoResourceFoundException.class })
    public ResponseEntity<ApiResponse<Void>> handleNotFound(Exception ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("Resource not found", ErrorCode.NOT_FOUND.name()));
    }

    /**
     * The right URL, the wrong verb.
     *
     * <p>Same gap as the one above and the same cost: a client sending GET to something that
     * only answers PATCH got a 500 and an ERROR-level stack trace, so a caller's mistake read
     * in the logs exactly like the server falling over. 405 says which it is, and the header
     * says what to send instead.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex) {
        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
        if (ex.getSupportedHttpMethods() != null && !ex.getSupportedHttpMethods().isEmpty()) {
            response.allow(ex.getSupportedHttpMethods().toArray(HttpMethod[]::new));
        }
        return response.body(ApiResponse.error(
                ex.getMethod() + " is not supported here", ErrorCode.METHOD_NOT_ALLOWED.name()));
    }

    @ExceptionHandler(IOException.class)
    public ResponseEntity<ApiResponse<Void>> handleIo(IOException ex) {
        // Client disconnected mid-response (e.g. browser navigated away). The socket is
        // gone, so there's nothing to write back — log quietly instead of as an error.
        if (isClientAbort(ex)) {
            log.debug("Client aborted connection: {}", ex.getMessage());
            return null;
        }
        return handleUnexpected(ex);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("An unexpected error occurred", ErrorCode.INTERNAL_ERROR.name()));
    }

    private static boolean isClientAbort(Throwable ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause.getClass().getName().endsWith("ClientAbortException")) {
                return true;
            }
            String message = cause.getMessage();
            if (message != null) {
                String lower = message.toLowerCase();
                if (lower.contains("broken pipe") || lower.contains("connection reset")) {
                    return true;
                }
            }
        }
        return false;
    }

    private static String formatFieldError(FieldError error) {
        return error.getField() + ": " + error.getDefaultMessage();
    }
}
