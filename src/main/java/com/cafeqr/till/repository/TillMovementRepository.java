package com.cafeqr.till.repository;

import com.cafeqr.till.domain.TillMovement;
import com.cafeqr.till.domain.TillMovement.Direction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TillMovementRepository extends JpaRepository<TillMovement, Long> {

    /** One session's movements, newest first — the list the till sheet shows. */
    List<TillMovement> findBySessionIdOrderByCreatedAtDesc(Long sessionId);

    /** The movements of a day's sessions, oldest first — for the daily report. */
    List<TillMovement> findBySessionIdInOrderByCreatedAtAsc(Collection<Long> sessionIds);

    /** What this session moved one way, for the expected-cash sum. Zero when it moved none. */
    @Query("select coalesce(sum(m.amount), 0) from TillMovement m "
            + "where m.sessionId = :sessionId and m.direction = :direction")
    BigDecimal sumBySession(@Param("sessionId") Long sessionId, @Param("direction") Direction direction);

    /** A movement, but only if it belongs to the session the caller expects — the delete guard. */
    Optional<TillMovement> findByIdAndSessionId(Long id, Long sessionId);
}
