"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Circle, KeyRound, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

import {
  clearRememberedWalletAccount,
  readRememberedWalletAccount,
  type RememberedWalletAccount,
} from "@/lib/rememberedWalletAccount";

export default function SignInPanel({ callbackUrl }: { callbackUrl: string }) {
  const [rememberedAccount, setRememberedAccount] =
    useState<RememberedWalletAccount | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "google" | "remembered" | "another" | null
  >(null);

  useEffect(() => {
    setRememberedAccount(readRememberedWalletAccount());
  }, []);

  async function continueWithGoogle(loginHint?: string) {
    setPendingAction(loginHint ? "remembered" : "google");
    try {
      await signIn(
        "google",
        { callbackUrl },
        loginHint ? { login_hint: loginHint } : undefined,
      );
    } catch (error) {
      setPendingAction(null);
      throw error;
    }
  }

  async function useAnotherGoogleAccount() {
    setPendingAction("another");
    try {
      await signIn("google", { callbackUrl }, { prompt: "select_account" });
    } catch (error) {
      setPendingAction(null);
      throw error;
    }
  }

  function forgetRememberedAccount() {
    clearRememberedWalletAccount();
    setRememberedAccount(null);
  }

  // Stagger configurations
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" as const },
    },
  };

  return (
    <main className="aurora-shell">
      <style>{`
        /* Google Fonts Inter */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        .aurora-shell {
          font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
          min-height: 100dvh;
          width: 100%;
          background-color: #ffffff;
          color: #111827;
          display: flex;
          padding: 8px;
          transition: all 500ms ease;
          -webkit-font-smoothing: antialiased;
        }

        @media (min-width: 1024px) {
          .aurora-shell {
            height: 100vh;
            overflow: hidden;
            padding: 16px;
          }
        }

        /* LEFT HERO COLUMN */
        .hero-col {
          display: none;
          position: relative;
          width: 52%;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding-bottom: 8rem;
          padding-left: 3rem;
          padding-right: 3rem;
          border-radius: 1.5rem;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          height: 100%;
          color: white; /* Text over video stays white */
        }

        @media (min-width: 1024px) {
          .hero-col {
            display: flex;
          }
        }

        .hero-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
        }

        .hero-content {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 20rem; /* max-w-xs */
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .hero-brand {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .hero-heading {
          font-size: 2.25rem; /* 36px */
          font-weight: 500;
          letter-spacing: -0.025em;
          white-space: nowrap;
          line-height: 1;
          margin-bottom: 0.5rem;
        }

        .hero-desc {
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.875rem; /* 14px */
          line-height: 1.625;
          padding-left: 1rem;
          padding-right: 1rem;
        }

        .steps-container {
          display: flex;
          flex-direction: column;
          gap: 0.75rem; /* space-y-3 */
        }

        /* RIGHT FORM COLUMN */
        .form-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 1rem; /* py-12 px-4 */
          overflow-y: auto;
        }

        @media (min-width: 1024px) {
          .form-col {
            padding-top: 1.5rem;
            padding-bottom: 1.5rem;
            padding-left: 4rem;
            padding-right: 4rem;
            overflow-y: hidden;
          }
        }

        .form-container {
          width: 100%;
          max-width: 36rem; /* max-w-xl */
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .form-header-title {
          font-size: 1.875rem; /* 30px */
          font-weight: 500;
          letter-spacing: -0.025em;
          color: #111827;
          margin: 0;
        }

        .form-header-desc {
          color: #6b7280; /* text-gray-500 */
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }

        .divider-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 2rem 0;
        }

        .divider-line {
          position: absolute;
          width: 100%;
          height: 1px;
          background-color: rgba(0, 0, 0, 0.1);
        }

        .divider-text {
          position: relative;
          background-color: #ffffff;
          padding: 0 1rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* CUSTOM BUTTONS */
        .social-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          background-color: #f9fafb; /* Light theme button bg */
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 0.75rem;
          padding: 0.875rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: #111827;
          cursor: pointer;
          transition: background-color 200ms ease, border-color 200ms ease, transform 200ms ease;
        }

        .social-btn:hover {
          background-color: #f3f4f6;
          border-color: rgba(0, 0, 0, 0.15);
        }

        .social-btn:active {
          transform: scale(0.98);
        }

        .primary-btn {
          width: 100%;
          height: 3.5rem; /* h-14 */
          background-color: #111827;
          color: #ffffff;
          font-weight: 600;
          border-radius: 0.75rem;
          border: none;
          cursor: pointer;
          transition: background-color 200ms ease, transform 200ms ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .primary-btn:hover {
          background-color: #1f2937;
        }

        .primary-btn:active {
          transform: scale(0.98);
        }

        .secondary-btn {
          width: 100%;
          height: 3.5rem; /* h-14 */
          background-color: #ffffff;
          color: #111827;
          font-weight: 600;
          border-radius: 0.75rem;
          border: 1px solid #e5e7eb;
          cursor: pointer;
          transition: background-color 200ms ease, transform 200ms ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .secondary-btn:hover {
          background-color: #f9fafb;
        }

        .secondary-btn:active {
          transform: scale(0.98);
        }

        /* REMEMBERED ACCOUNT STYLES */
        .session-card {
          border: 1px solid #e5e7eb;
          background: #f9fafb;
          border-radius: 1rem;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }

        .session-avatar {
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 9999px;
          background: #e5e7eb;
          color: #4b5563;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1rem;
        }

        .session-details {
          flex: 1;
          min-width: 0;
          margin-left: 1rem;
        }

        .session-name {
          font-weight: 600;
          font-size: 0.9375rem;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .session-email {
          font-size: 0.8125rem;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 0.125rem;
        }

        .session-forget {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #ef4444;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 0.5rem;
          transition: background-color 200ms ease;
        }

        .session-forget:hover {
          background: #fee2e2;
        }
      `}</style>

      {/* LEFT COLUMN: Video Hero */}
      <div className="hero-col">
        <video
          className="hero-video"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
          autoPlay
          muted
          loop
          playsInline
        />

        <motion.div
          className="hero-content"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className="hero-brand" variants={itemVariants}>
            <Circle size={24} strokeWidth={2.5} color="white" fill="white" />
            <span style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
              Veil
            </span>
          </motion.div>

          <motion.div variants={itemVariants}>
            <h1 className="hero-heading">Join Veil</h1>
            <p className="hero-desc">
              Follow these 3 quick phases to activate your space.
            </p>
          </motion.div>

          <motion.div className="steps-container" variants={itemVariants}>
            <StepItem number={1} text="Create your wallet" active />
            <StepItem number={2} text="Configure your account" />
            <StepItem number={3} text="Start paying" />
          </motion.div>
        </motion.div>
      </div>

      {/* RIGHT COLUMN: Form */}
      <div className="form-col">
        <motion.div
          className="form-container"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div>
            <h2 className="form-header-title">Initialize Vault</h2>
            <p className="form-header-desc">
              Verify your identity to begin the journey.
            </p>
          </div>

          {!rememberedAccount ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <button
                className="primary-btn"
                aria-busy={pendingAction !== null}
                disabled={pendingAction !== null}
                onClick={() => void continueWithGoogle()}
                type="button"
                style={{ justifyContent: 'center' }}
              >
                {pendingAction === "google" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                {pendingAction === "google" ? "Continuing..." : "Continue with Google"}
              </button>

              <p style={{ fontSize: '0.875rem', color: '#6b7280', textAlign: 'center', margin: 0 }}>
                A local vault will be generated automatically.
              </p>
            </div>
          ) : (
            <div>
              <div className="session-card">
                <div className="session-avatar">
                  {(rememberedAccount.name || rememberedAccount.email).charAt(0).toUpperCase()}
                </div>
                <div className="session-details">
                  <div className="session-name">
                    {rememberedAccount.name || rememberedAccount.email}
                  </div>
                  <div className="session-email">
                    {rememberedAccount.email}
                  </div>
                </div>
                <button
                  className="session-forget"
                  onClick={forgetRememberedAccount}
                  type="button"
                >
                  Forget
                </button>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                <button
                  className="primary-btn"
                  aria-busy={pendingAction !== null}
                  disabled={pendingAction !== null}
                  onClick={() => void continueWithGoogle(rememberedAccount.email)}
                  type="button"
                >
                  {pendingAction === "remembered" && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {pendingAction === "remembered"
                    ? "Continuing..."
                    : `Continue as ${rememberedAccount.name?.split(' ')[0] || "User"}`}
                </button>
                <button
                  className="secondary-btn"
                  aria-busy={pendingAction !== null}
                  disabled={pendingAction !== null}
                  onClick={() => void useAnotherGoogleAccount()}
                  type="button"
                >
                  {pendingAction === "another" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  {pendingAction === "another" ? "Opening Google..." : "Use another account"}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              <KeyRound size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
              Encrypted client boundary
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

// ----------------------------------------------------------------------
// Reusable Sub-components (Aurora specific)
// ----------------------------------------------------------------------

function StepItem({ number, text, active }: { number: number; text: string; active?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "1rem",
        borderRadius: "0.75rem",
        transition: "all 300ms ease",
        backgroundColor: active ? "#ffffff" : "transparent",
        color: active ? "#000000" : "#ffffff",
        border: active ? "1px solid #ffffff" : "none",
      }}
    >
      <div
        style={{
          width: "1.5rem",
          height: "1.5rem",
          borderRadius: "9999px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.75rem",
          fontWeight: 600,
          backgroundColor: active ? "#000000" : "rgba(255,255,255,0.1)",
          color: active ? "#ffffff" : "rgba(255,255,255,0.4)",
        }}
      >
        {number}
      </div>
      <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{text}</span>
    </div>
  );
}
