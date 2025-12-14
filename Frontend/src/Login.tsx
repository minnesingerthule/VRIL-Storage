import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './Login.css'






function App() {
  const [count, setCount] = useState(0)

function RegistrationForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: any) => {
    event.preventDefault();

    // Проверяем длину пароля
    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов.');
      return;
    }

    // Очищаем ошибку и отправляем данные
    setError('');
    console.log('Данные формы:', { name, email, password });
    alert('Регистрация успешна!');
  };
}


  return (
    <>
    <form>
      <div className='maindiv'> <h1> Hello, World! </h1>
      <h2>Login</h2>
      <input id="login"></input>
      <h2>Password</h2>
      <input id="password"></input>
      <button>Enter</button>
      </div>
    </form>
    </>
  )
}

export default App
