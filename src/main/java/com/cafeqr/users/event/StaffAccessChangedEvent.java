package com.cafeqr.users.event;

/**
 * A staff account's access changed: switched off, moved to another branch, or granted a
 * different set of permissions.
 *
 * <p>Published so the parts of the app holding a connection open on that member's behalf can let
 * go of it. Every ordinary request already reads the account row, so nothing else needs telling —
 * this exists for the one thing that authenticates once and then keeps talking for hours.
 */
public record StaffAccessChangedEvent(Long userId) {}
