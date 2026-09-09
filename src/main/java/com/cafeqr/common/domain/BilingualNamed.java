package com.cafeqr.common.domain;

/**
 * Something named in both languages — a café, a branch. Lets {@link com.cafeqr.common.util.Names}
 * apply one create/update rule to all of them instead of each service inventing its own.
 */
public interface BilingualNamed {

    String getNameEn();

    void setNameEn(String nameEn);

    String getNameAr();

    void setNameAr(String nameAr);
}
