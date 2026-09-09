package com.cafeqr.loyalty.dto;

/**
 * What one branch did for the stamp card in a window.
 *
 * <p>The card itself is restaurant-wide on purpose — a customer collects at one shop and
 * redeems at another — so these numbers deliberately do not balance per branch. That is the
 * useful part: a branch handing over far more rewards than it issues stamps is carrying the
 * cost of everyone else's collecting.
 *
 * @param branchId     null for activity recorded before branch attribution existed
 * @param branchNameEn null for those same rows, and for a branch since deleted
 * @param branchNameAr as above; both are carried so the caller renders one language per screen
 */
public record LoyaltyBranchActivityResponse(
        Long branchId,
        String branchNameEn,
        String branchNameAr,
        long stampsEarned,
        long rewardsRedeemed
) {
}
