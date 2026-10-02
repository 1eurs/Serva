import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const Ctx = createContext<(msg: ReactNode) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ReactNode>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<number>();

  const toast = useCallback((m: ReactNode) => {
    setMsg(m);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 1900);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      {/* A live region: "Added ✓" is the only confirmation a customer gets that a tap
          landed, so it has to reach a screen reader too, not just the screen. */}
      <div className="toast" aria-live="polite" aria-atomic="true">
        <div className="pill" style={{ transform: show ? 'none' : 'translateY(20px)', opacity: show ? 1 : 0, transition: 'transform .3s, opacity .3s' }}>
          {msg}
        </div>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
