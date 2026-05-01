import React, { useState } from 'react';
import { Smartphone, Download, Copy } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { copyToClipboard, downloadFile } from '../utils/helpers';

interface MobileAccessProps {
  roomId: string;
  onCopy: () => void;
  showCopyFeedback: boolean;
}

export const MobileAccess: React.FC<MobileAccessProps> = ({ roomId, onCopy, showCopyFeedback }) => {
  const [qrSize] = useState(180);
  const shareUrl = `${window.location.origin}?room=${roomId}`;

  const downloadQR = () => {
    const canvas = document.getElementById(`qr-code-${roomId}`) as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png');
      downloadFile(pngUrl, `syncpad-qr-${roomId}.png`);
    }
  };

  const handleCopyLink = async () => {
    await copyToClipboard(shareUrl);
    onCopy();
  };

  return (
    <div className="bg-white dark:bg-slate-950 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-colors">
      <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-blue-500" />
        Mobile Access
      </h3>

      <div className="bg-white p-3 rounded-xl border-2 border-slate-100 dark:border-slate-700 shadow-inner">
        <QRCodeCanvas
          id={`qr-code-${roomId}`}
          value={shareUrl}
          size={qrSize}
          level="H"
          includeMargin={true}
          imageSettings={{
            src: '/icon.svg',
            x: undefined,
            y: undefined,
            height: 24,
            width: 24,
            excavate: true,
          }}
        />
      </div>

      <div className="flex gap-2 w-full mt-6">
        <button
          onClick={downloadQR}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
          title="Download QR code as PNG"
        >
          <Download className="w-4 h-4" />
          Save QR
        </button>
        <button
          onClick={handleCopyLink}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showCopyFeedback
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300'
          }`}
          title="Copy room link to clipboard"
        >
          <Copy className="w-4 h-4" />
          {showCopyFeedback ? 'Copied!' : 'Copy Link'}
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Scan to instantly join this session
      </p>
    </div>
  );
};
