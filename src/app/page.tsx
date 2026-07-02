"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function HomePage() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch((err) => {
        console.log("Safari autoplay block handled:", err);
      });
    }
  }, []);

  return (
    <main className="home-minimal relative overflow-hidden">
      <style>{`
        /* Google Fonts Inter */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800;900&display=swap');

        .home-minimal {
          min-height: 100dvh;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #09090b;
          color: #ffffff;
          font-family: "Inter", sans-serif;
        }

        .home-minimal-content {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 36px;
          text-align: center;
        }

        .veil-title-container {
          transform: none;
        }

        .home-minimal h1 {
          margin: 0;
          font-family: "Inter", sans-serif;
          font-size: clamp(90px, 22vw, 260px);
          font-weight: 900;
          letter-spacing: -0.07em;
          line-height: 0.8;
          color: #ffffff;
          
          /* Premium front-facing straight-down 3D extrusion shadow */
          text-shadow: 
            0 1px 0 #e4e4e7,
            0 2px 0 #d4d4d8,
            0 3px 0 #c4c4c7,
            0 4px 0 #a1a1aa,
            0 5px 0 #8b8b93,
            0 6px 0 #71717a,
            0 7px 0 #52525b,
            0 8px 0 #3f3f46,
            0 9px 0 #27272a,
            0 10px 0 #18181b,
            0 12px 15px rgba(0, 0, 0, 0.65),
            0 22px 25px rgba(0, 0, 0, 0.45),
            0 32px 35px rgba(0, 0, 0, 0.35);
        }

        .home-minimal a {
          display: inline-flex;
          min-height: 52px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 0 32px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          text-decoration: none;
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
          transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), background 300ms ease, border-color 300ms ease;
        }

        .home-minimal a:hover {
          background: #ffffff;
          color: #09090b;
          border-color: #ffffff;
          transform: translateY(-2px);
        }

        .home-minimal a:active {
          transform: translateY(0) scale(0.98);
        }

        .home-minimal a:focus-visible {
          outline: 3px solid rgba(255, 255, 255, 0.4);
          outline-offset: 4px;
        }

        /* Continuous Bottom Ticker CSS */
        .ticker-wrap {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.35);
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(8px);
          z-index: 10;
          padding: 16px 0;
        }

        .ticker-track {
          display: flex;
          width: max-content;
        }

        .ticker-items {
          display: flex;
          gap: 48px;
          padding-right: 48px;
          animation: marquee 35s linear infinite;
        }

        .ticker-items span {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.25em;
          color: rgba(255, 255, 255, 0.5);
          white-space: nowrap;
        }

        .ticker-dot {
          color: rgba(255, 255, 255, 0.2) !important;
        }

        @keyframes marquee {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-100%, 0, 0);
          }
        }
      `}</style>

      {/* BACKGROUND VIDEO */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <video
          ref={videoRef}
          className="h-full w-full object-cover opacity-60 scale-[1.01]"
          autoPlay
          muted
          loop
          playsInline
        >
          <source 
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4" 
            type="video/mp4" 
          />
        </video>
        {/* Cinematic darkness vignetting and overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-zinc-950/40 mix-blend-multiply" />
        <div className="absolute inset-0 bg-zinc-950/40" />
      </div>

      {/* TOP HEADER NAVIGATION */}
      <header className="absolute top-0 left-0 right-0 z-20 flex h-20 items-center justify-start px-8 select-none">
        <img
          src="/Veil_Bg_Removed_Logo.png"
          alt="Veil Mini Logo"
          className="h-10 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
          draggable={false}
        />
      </header>

      {/* 3D INTERACTIVE CONTENT */}
      <div className="home-minimal-content">
        <div className="veil-title-container select-none">
          <svg
            viewBox="0 0 540 100"
            className="w-[85vw] max-w-[480px] h-auto mx-auto filter drop-shadow-[0_12px_12px_rgba(0,0,0,0.85)]"
            style={{ color: "#ffffff" }}
          >
            {/* Letter V */}
            <path
              d="M 15 15 L 60 85 L 105 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="11"
              strokeLinecap="butt"
              strokeLinejoin="miter"
            />
            {/* Letter E (three horizontal bars) */}
            <path
              d="M 155 20 L 235 20 M 155 50 L 235 50 M 155 80 L 235 80"
              fill="none"
              stroke="currentColor"
              strokeWidth="11"
              strokeLinecap="butt"
            />
            {/* Letter I */}
            <path
              d="M 330 15 L 330 85"
              fill="none"
              stroke="currentColor"
              strokeWidth="11"
              strokeLinecap="butt"
            />
            {/* Letter L */}
            <path
              d="M 435 15 L 435 85 L 495 85"
              fill="none"
              stroke="currentColor"
              strokeWidth="11"
              strokeLinecap="butt"
              strokeLinejoin="miter"
            />
          </svg>
        </div>

        <Link href="/signin?callbackUrl=/wallet">
          <span>Get started</span>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="13" 
            height="13" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="shrink-0"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* INFINITE TAGLINE MARQUEE TICKER */}
      <div className="ticker-wrap select-none">
        <div className="ticker-track">
          <div className="ticker-items">
            <span>Private Payments</span>
            <span className="ticker-dot">•</span>
            <span>Prediction Markets</span>
            <span className="ticker-dot">•</span>
            <span>Payment Requests</span>
            <span className="ticker-dot">•</span>
            <span>Batch Settlements in One Wallet</span>
            <span className="ticker-dot">•</span>
            <span>All in One</span>
            <span className="ticker-dot">•</span>
          </div>
          <div className="ticker-items" aria-hidden="true">
            <span>Private Payments</span>
            <span className="ticker-dot">•</span>
            <span>Prediction Markets</span>
            <span className="ticker-dot">•</span>
            <span>Payment Requests</span>
            <span className="ticker-dot">•</span>
            <span>Batch Settlements in One Wallet</span>
            <span className="ticker-dot">•</span>
            <span>All in One</span>
            <span className="ticker-dot">•</span>
          </div>
          <div className="ticker-items" aria-hidden="true">
            <span>Private Payments</span>
            <span className="ticker-dot">•</span>
            <span>Prediction Markets</span>
            <span className="ticker-dot">•</span>
            <span>Payment Requests</span>
            <span className="ticker-dot">•</span>
            <span>Batch Settlements in One Wallet</span>
            <span className="ticker-dot">•</span>
            <span>All in One</span>
            <span className="ticker-dot">•</span>
          </div>
        </div>
      </div>
    </main>
  );
}
