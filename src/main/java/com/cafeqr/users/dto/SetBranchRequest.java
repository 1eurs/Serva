package com.cafeqr.users.dto;

/**
 * Which branch a member belongs to; {@code null} means every branch.
 *
 * <p>This is its own request rather than a field on {@link UpdateUserRequest} because null has to
 * carry a meaning here. In a PATCH body a null field means "leave this alone", and the two
 * readings cannot both be true of the same field — which is why the team editor's "All branches"
 * option used to save nothing at all.
 */
public record SetBranchRequest(Long branchId) {}
