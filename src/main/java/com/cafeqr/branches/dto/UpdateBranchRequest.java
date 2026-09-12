package com.cafeqr.branches.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record UpdateBranchRequest(
        /** Legacy single name; prefer the bilingual pair below. Send "" to clear one side. */
        @Size(max = 150) String name,
        @Size(max = 150) String nameEn,
        @Size(max = 150) String nameAr,
        @Size(max = 300) String address,
        @Size(max = 40) String phone,
        @Size(max = 500) String openingHours,
        Boolean printerEnabled,
        Boolean counterMode,
        /* ---- how this shop runs its drawer; see Branch for what each one means ---- */
        Boolean tillEnabled,
        Boolean tillBlindCount,
        Boolean tillCarryFloat,
        /**
         * Ask for a written reason when the drawer is off by more than this. Null means "leave
         * it as it is", the same as every other field here — turning the question off entirely
         * is {@code tillNoteRequired = false}, because a PATCH cannot tell an omitted field
         * from one deliberately cleared.
         */
        @DecimalMin("0") @DecimalMax("1000") @Digits(integer = 4, fraction = 3) BigDecimal tillNoteOver,
        /** False stops a note ever being required; true with no threshold sets the default one. */
        Boolean tillNoteRequired
) {}
