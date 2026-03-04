import './App.css'
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'

function App() {

  const handlePayment = async () => {
    try {
      const response = await fetch('/create-checkout-session', {
        method: 'POST',
      })

      const data = await response.json()
      window.location.href = data.url
    } catch (error) {
      console.error('Payment error:', error)
      alert('Something went wrong')
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="logo-section">
          <img src="/loogo.png" alt="Team Logo" className="logo" />
          <h2 className="team-name">From Galochka</h2>
        </div>

        <div className="auth">
          <Show when="signed-out">
            <SignInButton />
            <SignUpButton />
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <main className="hero">
        <h1>Welcome to Our Platform 🚀</h1>
        <p>Secure SaaS powered by Clerk Authentication</p>

        <Show when="signed-in">
          <button className="pay-btn" onClick={handlePayment}>
            Buy Pro – 10€
          </button>
        </Show>
      </main>
    </div>
  )
}

export default App