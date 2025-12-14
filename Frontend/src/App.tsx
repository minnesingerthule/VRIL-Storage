import { useState } from "react";
import DriveApp from "./FileBrowser";
import { apiLogin, apiMe, apiRegister } from "./api";

function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token")
  );
  const [email, setEmail] = useState<string | null>(
    () => localStorage.getItem("email")
  );

  const handleLoggedIn = (newToken: string, email: string) => {
    setToken(newToken);
    setEmail(email);
    localStorage.setItem("token", newToken);
    localStorage.setItem("email", email);
  };

  const handleLogout = () => {
    setToken(null);
    setEmail(null);
    localStorage.removeItem("token");
    localStorage.removeItem("email");
  };

  if (!token) {
    return <AuthPage onLoggedIn={handleLoggedIn} />;
  }

  return (
    <DriveApp token={token} email={email} onLogout={handleLogout} />
  );
}

interface AuthPageProps {
  onLoggedIn: (token: string, email: string) => void;
}

function AuthPage({ onLoggedIn }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await apiRegister(email, password);
      }
      const tokenRes = await apiLogin(email, password);
      // проверим токен
      await apiMe(tokenRes.access_token);
      onLoggedIn(tokenRes.access_token, email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h1>Мой диск</h1>
      <div className="auth-card">
        <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading
              ? "..."
              : mode === "login"
              ? "Войти"
              : "Зарегистрироваться"}
          </button>
        </form>
        <button
          type="button"
          className="link-button"
          onClick={() =>
            setMode(mode === "login" ? "register" : "login")
          }
        >
          {mode === "login"
            ? "Нет аккаунта? Зарегистрируйтесь"
            : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}

export default App;
