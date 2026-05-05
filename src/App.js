import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  onAuthStateChanged
} from 'firebase/auth';
import Dashboard from './Dashboard'; 

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login'); // login, signup, reset

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else if (mode === 'signup') await createUserWithEmailAndPassword(auth, email, password);
      else {
        await sendPasswordResetEmail(auth, email);
        alert("Check your email for the reset link!");
        setMode('login');
      }
    } catch (err) { alert(err.message); }
  };

  if (user) return <Dashboard user={user} />;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2>{mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign Up' : 'Reset Password'}</h2>
        <form onSubmit={handleSubmit}>
          <input style={styles.input} type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
          {mode !== 'reset' && (
            <input style={styles.input} type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
          )}
          <button style={styles.button} type="submit">
            {mode === 'reset' ? 'Send Reset Link' : 'Go'}
          </button>
        </form>
        <div style={{ marginTop: '15px', fontSize: '0.9rem' }}>
          {mode === 'login' ? (
            <>
              <span onClick={() => setMode('signup')} style={styles.link}>Create Account</span> | 
              <span onClick={() => setMode('reset')} style={styles.link}> Forgot Password?</span>
            </>
          ) : (
            <span onClick={() => setMode('login')} style={styles.link}>Back to Login</span>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: 'white' },
  card: { backgroundColor: '#1e1e1e', padding: '40px', borderRadius: '12px', textAlign: 'center', width: '320px' },
  input: { width: '100%', padding: '10px', margin: '10px 0', borderRadius: '5px', border: '1px solid #333' },
  button: { width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' },
  link: { color: '#007bff', cursor: 'pointer', margin: '0 5px' }
};

export default App;