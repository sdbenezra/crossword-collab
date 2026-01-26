import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Capture from './pages/Capture';
import Verify from './pages/Verify';
import Solve from './pages/Solve';
import Join from './pages/Join';
import { useAuth } from './hooks/useAuth';
import { useEffect } from 'react';
import { signInUser } from './services/authService';

export default function App() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      signInUser();
    }
  }, [loading, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/solve/:id" element={<Solve />} />
        <Route path="/join" element={<Join />} />
      </Routes>
    </BrowserRouter>
  );
}
