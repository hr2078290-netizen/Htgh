import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Wallet, QrCode, ClipboardCheck, AlertCircle, Camera } from 'lucide-react';
import { GameSettings } from '../types';

export default function Deposit() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GameSettings>({ nextCrashValue: 1.5, currentUpiId: '', currentQrCode: '' });
  const [amount, setAmount] = useState('');
  const [txnId, setTxnId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'config'), (snap) => {
      if (snap.exists()) setSettings(snap.data() as GameSettings);
    });
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit check
        alert('File size too large. Please use an image under 1MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, 'deposits'), {
        userId: user.uid,
        userEmail: user.email,
        amount: parseFloat(amount),
        transactionId: txnId,
        proofUrl: proofUrl,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      setSuccess(true);
      setAmount('');
      setTxnId('');
      setProofUrl('');
    } catch (e) {
      alert('Failed to submit request');
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-black italic uppercase italic tracking-tighter">Add <span className="text-green-500">Credits</span></h1>
        <p className="text-white/40 text-sm mt-1 uppercase tracking-widest font-medium">Recharge your wallet via UPI</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* UPI Details */}
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center space-y-4">
             <div className="text-[10px] font-bold uppercase tracking-widest text-[#F27D26]">Official Payment QR</div>
             <div className="aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center border-4 border-white/5">
                {settings.currentQrCode ? (
                  <img src={settings.currentQrCode} alt="UPI QR" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                ) : (
                  <QrCode className="w-20 h-20 text-black/10" />
                )}
             </div>
             <div className="pt-4 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Receiver UPI ID</div>
                <div className="flex items-center justify-center gap-2 group">
                   <div className="text-xl font-mono font-bold text-white selection:bg-green-500">{settings.currentUpiId || 'admin@upi'}</div>
                   <button onClick={() => {navigator.clipboard.writeText(settings.currentUpiId || ''); alert('Copied!')}} className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors">
                     <ClipboardCheck className="w-4 h-4" />
                   </button>
                </div>
             </div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
             <AlertCircle className="w-5 h-5 text-blue-400 shrink-0" />
             <p className="text-[11px] text-blue-400">Please complete the payment on your UPI app first, then enter the Transaction reference ID below.</p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          {success ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-10">
              <div className="bg-green-500 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-black" />
              </div>
              <h3 className="text-xl font-bold">Request Submitted</h3>
              <p className="text-white/40 text-sm mt-2 font-medium uppercase tracking-widest">Admin will verify and add balance within 15-30 mins.</p>
              <button onClick={() => setSuccess(false)} className="mt-8 text-green-500 underline font-bold text-sm">Submit another</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
               <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-white/40 tracking-widest">Deposit Amount (INR)</label>
                 <input 
                   type="number" 
                   required
                   value={amount}
                   onChange={(e) => setAmount(e.target.value)}
                   className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none font-mono text-lg focus:border-green-500/50"
                   placeholder="₹ 500"
                 />
               </div>
               <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-white/40 tracking-widest">UPI Transaction ID (Ref No)</label>
                 <input 
                   type="text" 
                   required
                   value={txnId}
                   onChange={(e) => setTxnId(e.target.value)}
                   className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none font-mono text-lg focus:border-green-500/50"
                   placeholder="1234567890..."
                 />
               </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-white/40 tracking-widest">Upload Payment Proof (Screenshot)</label>
                  <label className="flex flex-col items-center justify-center w-full min-h-[140px] bg-white/5 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-all overflow-hidden group">
                     {proofUrl ? (
                       <div className="relative w-full h-full">
                         <img src={proofUrl} className="w-full h-full object-contain max-h-[200px]" referrerPolicy="no-referrer" />
                         <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-[10px] font-bold uppercase text-white border border-white/20 px-3 py-1 rounded-full">Change Image</span>
                         </div>
                       </div>
                     ) : (
                       <div className="flex flex-col items-center justify-center pt-5 pb-6">
                         <Camera className="w-10 h-10 text-white/20 mb-2" />
                         <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Select Screenshot</p>
                       </div>
                     )}
                     <input type="file" className="hidden" accept="image/*" required={!proofUrl} onChange={handleImageUpload} />
                  </label>
                  <input 
                    type="text" 
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none font-mono text-[10px] text-white/20"
                    placeholder="Or paste screenshot URL here"
                  />
                </div>
               <button type="submit" className="w-full bg-green-500 hover:bg-green-400 text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-lg shadow-green-500/20 transition-all mt-6 active:scale-95">
                 Verify Deposit
               </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
