import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChange, signInUser } from '../services/authService';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => {
      setUser(authUser);
      setLoading(false);

      // Auto sign-in anonymously if not authenticated
      if (!authUser) {
        signInUser().catch(console.error);
      }
    });

    return unsubscribe;
  }, []);

  return { user, loading };
}
