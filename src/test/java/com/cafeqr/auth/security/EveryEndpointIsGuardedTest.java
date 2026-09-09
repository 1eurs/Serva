package com.cafeqr.auth.security;

import com.cafeqr.users.domain.Permission;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.ClassUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every endpoint is behind something, and the something is written down here.
 *
 * <p>The permission model is only as good as its weakest controller, and the weak one is always
 * the newest: a class ships, the `@PreAuthorize` is forgotten, and the endpoint quietly falls
 * through to {@code anyRequest().authenticated()} — reachable by a cashier, a waiter, anyone with
 * a login. Nothing in review reliably catches that, because the missing line is invisible.
 *
 * <p>So this walks every {@code @RestController} on the classpath instead of trusting a list. A
 * new endpoint has to be one of three things — public by design, deliberately open to any signed-
 * in member and named below with the reason, or gated on a permission — and adding a fourth kind
 * fails here rather than in production.
 */
class EveryEndpointIsGuardedTest {

    private static final String BASE_PACKAGE = "com.cafeqr";

    /**
     * Anonymous by design. Mirrors the {@code permitAll()} matchers in {@link SecurityConfig} —
     * if the two ever disagree, the one that is wrong is whichever was edited without the other.
     */
    private static final List<String> ANONYMOUS = List.of(
            "/api/public/",
            "/api/auth/login",
            "/api/auth/refresh",
            "/api/auth/register-platform-admin",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/files/");

    /**
     * Open to any signed-in member on purpose, each for a stated reason. Anything reached here is
     * about the caller themselves or about what the whole dashboard needs to render, and none of
     * it is another account's, another branch's or another café's.
     */
    private static final List<Allowed> ANY_MEMBER = List.of(
            new Allowed("/api/auth/me", "your own account"),
            new Allowed("/api/auth/logout", "your own sessions"),
            new Allowed("/api/auth/change-password", "your own password, current one required"),
            new Allowed("/api/auth/change-email", "your own email, current password required"),
            new Allowed("/api/dashboard/features", "what the café's plan includes; the nav needs it"),
            new Allowed("/api/dashboard/stream-ticket", "trades your own header token for a stream ticket"),
            new Allowed("/api/restaurants/{restaurantId}/branches",
                    "the branch switcher; AccessGuard confines it to your own café"),
            new Allowed("/api/branches/{branchId}",
                    "one branch of your own café; AccessGuard confines it"));

    /** Endpoints whose guard is a permission: the expression has to name one that exists. */
    private static final Pattern AUTHORITY = Pattern.compile("'([A-Z_]+)'");

    @Test
    void everyEndpointIsPublicByDesignOrBehindAPermission() {
        List<String> unguarded = new ArrayList<>();

        for (Class<?> controller : controllers()) {
            for (Method method : controller.getMethods()) {
                RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
                if (mapping == null) {
                    continue;
                }
                boolean guarded = AnnotatedElementUtils.hasAnnotation(method, PreAuthorize.class)
                        || AnnotatedElementUtils.hasAnnotation(controller, PreAuthorize.class);
                for (String path : paths(controller, mapping)) {
                    if (guarded || isAnonymous(path) || isOpenToAnyMember(path)) {
                        continue;
                    }
                    unguarded.add(path + "  (" + controller.getSimpleName() + "#" + method.getName() + ")");
                }
            }
        }

        assertThat(unguarded)
                .describedAs("""
                        Endpoints reachable by any signed-in member with no permission behind them.
                        Add @PreAuthorize, or — if it really is meant for everyone with a login — \
                        add it to ANY_MEMBER above with the reason.""")
                .isEmpty();
    }

    /**
     * A misspelt authority is not a compile error and not a visible failure: {@code hasAuthority
     * ('STOK')} simply matches nobody, and the page it guards is empty for every member of every
     * café until somebody thinks to look at the annotation.
     */
    @Test
    void everyGuardNamesAPermissionThatExists() {
        List<String> unknown = new ArrayList<>();

        for (Class<?> controller : controllers()) {
            List<PreAuthorize> guards = new ArrayList<>();
            PreAuthorize onClass = AnnotatedElementUtils.findMergedAnnotation(controller, PreAuthorize.class);
            if (onClass != null) {
                guards.add(onClass);
            }
            for (Method method : controller.getMethods()) {
                PreAuthorize onMethod = AnnotatedElementUtils.findMergedAnnotation(method, PreAuthorize.class);
                if (onMethod != null) {
                    guards.add(onMethod);
                }
            }
            for (PreAuthorize guard : guards) {
                Matcher matcher = AUTHORITY.matcher(guard.value());
                while (matcher.find()) {
                    String authority = matcher.group(1);
                    if (!isPermission(authority)) {
                        unknown.add(controller.getSimpleName() + ": " + guard.value());
                    }
                }
            }
        }

        assertThat(unknown)
                .describedAs("@PreAuthorize expressions naming an authority that is not a Permission")
                .isEmpty();
    }

    /** The deprecated permission is not quietly guarding anything. */
    @Test
    void nothingIsGatedOnTheRetiredBillingPermission() {
        for (Class<?> controller : controllers()) {
            PreAuthorize onClass = AnnotatedElementUtils.findMergedAnnotation(controller, PreAuthorize.class);
            assertThat(onClass == null ? "" : onClass.value())
                    .describedAs("%s", controller.getSimpleName())
                    .doesNotContain("'BILLING'");
            for (Method method : controller.getMethods()) {
                PreAuthorize onMethod = AnnotatedElementUtils.findMergedAnnotation(method, PreAuthorize.class);
                assertThat(onMethod == null ? "" : onMethod.value())
                        .describedAs("%s#%s", controller.getSimpleName(), method.getName())
                        .doesNotContain("'BILLING'");
            }
        }
    }

    // ----------------------------------------------------------------- helpers

    private static List<Class<?>> controllers() {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        List<Class<?>> found = new ArrayList<>();
        for (BeanDefinition definition : scanner.findCandidateComponents(BASE_PACKAGE)) {
            found.add(ClassUtils.resolveClassName(definition.getBeanClassName(), null));
        }
        assertThat(found).describedAs("controllers found by scanning " + BASE_PACKAGE).isNotEmpty();
        return found;
    }

    /** Full paths for one handler: the class's prefixes crossed with the method's own. */
    private static Set<String> paths(Class<?> controller, RequestMapping method) {
        RequestMapping onClass = AnnotatedElementUtils.findMergedAnnotation(controller, RequestMapping.class);
        String[] prefixes = (onClass == null || onClass.path().length == 0) ? new String[]{""} : onClass.path();
        String[] suffixes = method.path().length == 0 ? new String[]{""} : method.path();

        Set<String> paths = new LinkedHashSet<>();
        for (String prefix : prefixes) {
            for (String suffix : suffixes) {
                paths.add(join(prefix, suffix));
            }
        }
        return paths;
    }

    private static String join(String prefix, String suffix) {
        if (suffix.isEmpty()) {
            return prefix;
        }
        return prefix + (suffix.startsWith("/") ? suffix : "/" + suffix);
    }

    private static boolean isAnonymous(String path) {
        return ANONYMOUS.stream().anyMatch(path::startsWith);
    }

    private static boolean isOpenToAnyMember(String path) {
        return ANY_MEMBER.stream().anyMatch(allowed -> allowed.path().equals(path));
    }

    private static boolean isPermission(String authority) {
        try {
            Permission.valueOf(authority);
            return true;
        } catch (IllegalArgumentException notAPermission) {
            return false;
        }
    }

    /** An endpoint any signed-in member may call, and why that is safe. */
    private record Allowed(String path, String why) {}
}
