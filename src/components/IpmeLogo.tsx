import React, { useState } from 'react';
// @ts-ignore
import logoImg from '@/logo-ipme.png';

interface IpmeLogoProps {
  variant?: 'icon' | 'full' | 'horizontal' | 'compact';
  className?: string;
  size?: number | string;
}

export default function IpmeLogo({ variant = 'horizontal', className = '', size }: IpmeLogoProps) {
  const [imageError, setImageError] = useState(false);
  const [useOfficialImage, setUseOfficialImage] = useState(true);

  // We support auto-loading of an custom uploaded logo from the typical static paths
  const imageUrls = [logoImg, '/logo-ipme.png', '/ipme-logo.png', '/ipme_logo_oficial.png'];

  // High-fidelity vector SVG symbol
  const renderSvgIcon = (iconSize: number | string = 48) => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-300 hover:scale-105"
    >
      <g>
        {/* Underlay hand-holding arc */}
        <path
          d="M20 110 C50 90 110 90 140 110"
          stroke="#cbd5e1"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* Yellow Figure (Top-Center) */}
        {/* Head */}
        <circle cx="80" cy="52" r="11" fill="#fdd000" />
        {/* Body/Arms */}
        <path
          d="M78 114 C73 98 64 85 58 76 C65 80 74 81 80 71 C86 81 95 80 102 76 C96 85 87 98 82 114 Z"
          fill="#fdd000"
        />

        {/* Green Figure (Upper-Left) */}
        {/* Head */}
        <circle cx="51" cy="64" r="11" fill="#00bd2a" />
        {/* Body/Arms */}
        <path
          d="M78 114 C60 104 43 93 25 89 C32 84 41 81 46 71 C50 77 53 82 58 76 C64 85 73 98 78 114 Z"
          fill="#00bd2a"
        />

        {/* Cyan Figure (Upper-Right) */}
        {/* Head */}
        <circle cx="109" cy="64" r="11" fill="#00bed5" />
        {/* Body/Arms */}
        <path
          d="M82 114 C100 104 117 93 135 89 C128 84 119 81 114 71 C110 77 107 82 102 76 C96 85 87 98 82 114 Z"
          fill="#00bed5"
        />

        {/* Dark Navy Blue Figure (Bottom-Left) */}
        {/* Head */}
        <circle cx="30" cy="94" r="11" fill="#19144d" />
        {/* Body/Arms */}
        <path
          d="M78 114 C56 109 33 114 14 118 C20 110 24 105 27 97 C27 101 27 105 25 89 C43 93 60 104 78 114 Z"
          fill="#19144d"
        />

        {/* Red Figure (Bottom-Right) */}
        {/* Head */}
        <circle cx="130" cy="94" r="11" fill="#e82118" />
        {/* Body/Arms */}
        <path
          d="M82 114 C104 109 127 114 146 118 C140 110 136 105 133 97 C133 101 133 105 135 89 C117 93 100 104 82 114 Z"
          fill="#e82118"
        />
      </g>
    </svg>
  );

  // If we should load an uploaded image instead
  if (useOfficialImage && !imageError) {
    const defaultImgSrc = imageUrls[0];
    const horizontalStyle = variant === 'horizontal' ? 'h-24 md:h-[112px] py-0.5 w-auto' : 'h-36 w-auto';
    return (
      <img
        src={defaultImgSrc}
        alt="IPME Logo"
        className={`${horizontalStyle} ${className} object-contain transition-all hover:scale-105 duration-200`}
        onError={() => {
          // If the primary image path fails, try the next one or fall back to SVG
          setImageError(true);
        }}
      />
    );
  }

  // --- Fallback SVG/HTML renderings if image is not uploaded yet ---
  if (variant === 'icon') {
    return renderSvgIcon(size || 64);
  }

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        {renderSvgIcon(size || 48)}
        <div style={{ fontFamily: 'Georgia, serif' }} className="flex flex-col select-none leading-none">
          <span className="text-[#19144d] font-black text-base tracking-tight">IPME</span>
          <span className="text-[8px] uppercase font-bold text-gray-400">Eusébio / CE</span>
        </div>
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        {renderSvgIcon(size || 96)}
        <div style={{ fontFamily: 'Georgia, serif' }} className="flex flex-col items-center mt-2.5 leading-tight">
          <span className="text-[#19144d] font-black text-3xl tracking-wider mb-1.5">IPME</span>
          <span className="text-[11px] md:text-[12.5px] uppercase font-semibold tracking-wide text-slate-800">
            INSTITUTO DE <span className="font-bold text-[#19144d]">PREVIDÊNCIA</span>
          </span>
          <span className="text-[11px] md:text-[12.5px] uppercase font-semibold tracking-wide text-slate-800">
            DO MUNICÍPIO DE <span className="font-bold text-[#19144d]">EUSÉBIO</span>
          </span>
        </div>
      </div>
    );
  }

  // Horizontal Layout (ideal for the sticky app header)
  return (
    <div className={`flex items-center gap-3.5 md:gap-5 select-none ${className}`}>
      {renderSvgIcon(size || 68)}
      <div style={{ fontFamily: 'Georgia, serif' }} className="flex flex-col justify-center leading-none">
        <span className="text-[#19144d] font-black text-2xl md:text-3xl tracking-tight">IPME</span>
        <span className="text-[10px] md:text-[12px] uppercase font-semibold text-slate-800 tracking-wide mt-2 whitespace-nowrap">
          Instituto de <span className="font-bold text-[#19144d]">Previdência</span>
        </span>
        <span className="text-[10px] md:text-[12px] uppercase font-semibold text-slate-800 tracking-wide mt-0.5 whitespace-nowrap">
          do Município de <span className="font-bold text-[#19144d]">Eusébio</span>
        </span>
      </div>
    </div>
  );
}
