package com.cafeqr.users.repository;

import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    /** Whether any account holds the given permission — used to seed the first platform admin. */
    @Query("select case when count(u) > 0 then true else false end "
            + "from User u where :permission member of u.permissions")
    boolean existsByPermission(@Param("permission") Permission permission);

    List<User> findByRestaurantIdOrderByIdAsc(Long restaurantId);

    /** The owner (billing recipient) of a restaurant, used by scheduled email jobs. */
    Optional<User> findFirstByRestaurantIdAndOwnerTrueOrderByIdAsc(Long restaurantId);

    List<User> findByBranchIdOrderByIdAsc(Long branchId);

    /** Every owner across the platform — the audience for a billing notice or a broadcast. */
    List<User> findByOwnerTrueAndActiveTrue();

    /**
     * {@code [restaurantId, ownerCount]} for the console's activation checklist.
     *
     * <p>Owners specifically, not every account: the question the checklist asks is "can the
     * person who runs this café sign in", and a café with a cashier but no owner has not
     * finished onboarding.
     */
    @Query("SELECT u.restaurantId, COUNT(u) FROM User u "
            + "WHERE u.restaurantId IS NOT NULL AND u.owner = true GROUP BY u.restaurantId")
    List<Object[]> countOwnersPerRestaurant();
}
