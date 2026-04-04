import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

type TransactionFeedbackContextValue = {
  celebrate: () => void;
  gloom: () => void;
};

const TransactionFeedbackContext =
  createContext<TransactionFeedbackContextValue | null>(null);

function runConfetti() {
  const count = 220;
  const defaults = { origin: { y: 0.72 }, zIndex: 300 };
  const fire = (ratio: number, opts: Parameters<typeof confetti>[0]) => {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * ratio),
    });
  };
  fire(0.25, { spread: 26, startVelocity: 55, colors: ['#22c55e', '#3b82f6', '#fbbf24', '#f472b6'] });
  fire(0.2, { spread: 60, colors: ['#34d399', '#60a5fa'] });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.85 });
  fire(0.1, { spread: 120, startVelocity: 28, decay: 0.92, scalar: 1.15 });
  fire(0.1, { spread: 130, startVelocity: 42 });
}

export const TransactionFeedbackProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [gloomOn, setGloomOn] = useState(false);

  const celebrate = useCallback(() => {
    runConfetti();
  }, []);

  const gloom = useCallback(() => {
    setGloomOn(true);
    const root = document.getElementById('root');
    root?.classList.add('tx-gloom-shake');
    window.setTimeout(() => {
      setGloomOn(false);
      root?.classList.remove('tx-gloom-shake');
    }, 1600);
  }, []);

  const value = React.useMemo(
    () => ({ celebrate, gloom }),
    [celebrate, gloom]
  );

  return (
    <TransactionFeedbackContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {gloomOn && (
          <motion.div
            key="gloom-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="pointer-events-none fixed inset-0 z-[190]"
            style={{
              background:
                'linear-gradient(180deg, rgba(15,23,42,0.45) 0%, rgba(30,41,59,0.35) 100%)',
              backdropFilter: 'grayscale(0.9) brightness(0.88)',
              WebkitBackdropFilter: 'grayscale(0.9) brightness(0.88)',
            }}
            aria-hidden
          />
        )}
      </AnimatePresence>
    </TransactionFeedbackContext.Provider>
  );
};

export function useTransactionFeedback(): TransactionFeedbackContextValue {
  const ctx = useContext(TransactionFeedbackContext);
  if (!ctx) {
    return { celebrate: () => {}, gloom: () => {} };
  }
  return ctx;
}
