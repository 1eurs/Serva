package com.cafeqr.auth.security;

import com.cafeqr.common.util.Pasted;
import com.cafeqr.users.repository.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public CustomUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * The one door every password check walks through, so the pasted username is cleaned here —
     * an invisible bidi mark off a WhatsApp copy would otherwise match nothing at all.
     */
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return userRepository.findByUsernameIgnoreCase(Pasted.identifier(username))
                .map(CustomUserDetails::from)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    /**
     * The account as it stands right now, by id — how a bearer token becomes a principal.
     *
     * <p>Empty when the account has been deleted; the caller still has to check
     * {@link CustomUserDetails#isEnabled()} for one that has been switched off.
     */
    @Transactional(readOnly = true)
    public Optional<CustomUserDetails> loadById(Long userId) {
        return userRepository.findById(userId).map(CustomUserDetails::from);
    }
}
