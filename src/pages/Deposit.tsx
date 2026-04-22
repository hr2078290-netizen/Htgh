import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Wallet, QrCode, ClipboardCheck, AlertCircle, Camera, Check as CheckIcon, CreditCard, ChevronRight, Zap, Send } from 'lucide-react';
import { GameSettings } from '../types';

export default function Deposit() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<GameSettings>({ nextCrashValue: 1.5, currentUpiId: '', currentQrCode: '' });
  const [amount, setAmount] = useState('');
  const [txnId, setTxnId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [success, setSuccess] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'razorpay' | 'manual' | 'cashfree'>('cashfree');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Load Razorpay Script
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    // Load Cashfree Script
    const cfScript = document.createElement("script");
    cfScript.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    cfScript.async = true;
    document.body.appendChild(cfScript);
  }, []);

  const handleCashfreePayment = async () => {
    if (!user || !amount || parseFloat(amount) < 100) {
      alert("Minimum deposit amount is ₹100");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch("/api/payment/cashfree/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), userId: user.uid })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create Cashfree order");

      const cashfree = new (window as any).Cashfree({
        mode: "production" // or "sandbox"
      });

      await cashfree.checkout({
        paymentSessionId: data.payment_session_id,
        redirectTarget: "_self" // Use _self for better iframe compatibility
      });

    } catch (e: any) {
      alert(e.message || "Cashfree payment failed");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'config'), (snap) => {
      if (snap.exists()) setSettings(snap.data() as GameSettings);
    });
  }, []);

  const handleRazorpayPayment = async () => {
    if (!user || !amount || parseFloat(amount) < 100) {
      alert("Minimum deposit amount is ₹100");
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Create order on backend
      const res = await fetch("/api/payment/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), userId: user.uid })
      });

      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.error || "Failed to create order");

      // 2. Open Razorpay Checkout
      const options = {
        key: orderData.key,
        amount: Math.round(parseFloat(amount) * 100),
        currency: "INR",
        name: "Avited Club",
        description: `Deposit for ${user.email}`,
        order_id: orderData.orderId,
        handler: async (response: any) => {
          // 3. Verify payment on backend
          const verifyRes = await fetch("/api/payment/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...response,
              userId: user.uid,
              amount: amount
            })
          });

          if (verifyRes.ok) {
            setSuccess(true);
          } else {
            alert("Payment verification failed. Please contact support.");
          }
        },
        prefill: {
          email: user.email || "",
          contact: profile?.phone || ""
        },
        theme: {
          color: "#F27D26"
        },
        modal: {
          onDismiss: () => setIsProcessing(false)
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e: any) {
      alert(e.message || "Payment initiation failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-black italic uppercase italic tracking-tighter text-white">Add <span className="text-green-500">Credits</span></h1>
        <p className="text-white/40 text-sm mt-1 uppercase tracking-widest font-medium">Recharge your wallet instantly</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Payment Modes Selector */}
        <div className="md:col-span-4 space-y-4">
           <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 px-2">Select Payment Method</h3>
           
           <button 
             onClick={() => setPaymentMode('cashfree')}
             className={`w-full p-4 rounded-2xl border transition-all flex items-center gap-4 ${paymentMode === 'cashfree' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
           >
              <div className={`p-2 rounded-lg ${paymentMode === 'cashfree' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/40'}`}>
                <Zap className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-xs font-black uppercase text-white">Cashfree</div>
                <div className="text-[10px] font-bold text-white/40">UPI / Cards / Netbanking</div>
              </div>
              {paymentMode === 'cashfree' && <CheckIcon className="w-4 h-4 text-indigo-500 ml-auto" />}
           </button>

           <button 
             onClick={() => setPaymentMode('razorpay')}
             className={`w-full p-4 rounded-2xl border transition-all flex items-center gap-4 ${paymentMode === 'razorpay' ? 'bg-blue-500/10 border-blue-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
           >
              <div className={`p-2 rounded-lg ${paymentMode === 'razorpay' ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/40'}`}>
                <Zap className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-xs font-black uppercase text-white">Razorpay</div>
                <div className="text-[10px] font-bold text-white/40">Instant • Trusted</div>
              </div>
              {paymentMode === 'razorpay' && <CheckIcon className="w-4 h-4 text-blue-500 ml-auto" />}
           </button>

           <button 
             onClick={() => setPaymentMode('manual')}
             className={`w-full p-4 rounded-2xl border transition-all flex items-center gap-4 ${paymentMode === 'manual' ? 'bg-[#F27D26]/10 border-[#F27D26]/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
           >
              <div className={`p-2 rounded-lg ${paymentMode === 'manual' ? 'bg-[#F27D26] text-black' : 'bg-white/10 text-white/40'}`}>
                <QrCode className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-xs font-black uppercase text-white">Manual UPI</div>
                <div className="text-[10px] font-bold text-white/40">Offline verification</div>
              </div>
              {paymentMode === 'manual' && <CheckIcon className="w-4 h-4 text-[#F27D26] ml-auto" />}
           </button>

           <a 
              href="https://t.me/Jalwa369deposit"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-4 rounded-2xl border bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20 transition-all flex items-center gap-4 group"
            >
               <div className="p-2 rounded-lg bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 group-hover:scale-110 transition-transform">
                 <Send className="w-5 h-5" />
               </div>
               <div className="text-left">
                 <div className="text-xs font-black uppercase text-white flex items-center gap-2">
                   Fast Deposit
                   <span className="bg-cyan-500 text-black text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase">Support</span>
                 </div>
                 <div className="text-[10px] font-bold text-white/40">Direct via Telegram</div>
               </div>
               <ChevronRight className="w-4 h-4 text-cyan-500 ml-auto group-hover:translate-x-1 transition-transform" />
            </a>
        </div>

        {/* Action Panel */}
        <div className="md:col-span-8 flex flex-col gap-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            {success ? (
              <div className="text-center py-10">
                <div className="bg-green-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30">
                  <CheckIcon className="w-10 h-10 text-black" />
                </div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">Credits Added!</h3>
                <p className="text-white/40 text-sm mt-3 font-medium uppercase tracking-widest max-w-xs mx-auto">
                  {paymentMode === 'manual' 
                    ? "Request submitted! Admin will verify and add balance within 15 mins."
                    : "Successfully recharged! Your balance has been updated automatically."}
                </p>
                <button onClick={() => setSuccess(false)} className="mt-10 text-green-500 font-bold uppercase text-xs tracking-[0.2em] border-b border-green-500/50 pb-1">Deposit More</button>
              </div>
            ) : (paymentMode === 'razorpay' || paymentMode === 'cashfree') ? (
              <div className="space-y-6">
                 <div className="bg-gradient-to-br from-indigo-500/10 to-transparent p-5 rounded-2xl border border-indigo-500/20">
                    <div className="text-[10px] font-bold uppercase text-indigo-400 tracking-widest mb-4">Enter Recharge Amount</div>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-white/20 italic">₹</span>
                       <input 
                         type="number"
                         value={amount}
                         onChange={(e) => setAmount(e.target.value)}
                         className="w-full bg-black/40 border border-white/10 rounded-xl py-5 pl-12 pr-4 text-3xl font-mono font-black text-white outline-none focus:border-indigo-500 transition-all"
                         placeholder="500"
                       />
                    </div>
                    <div className="flex gap-2 mt-4">
                       {[100, 500, 1000, 5000].map(val => (
                         <button 
                           key={val}
                           onClick={() => setAmount(val.toString())}
                           className="flex-1 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg py-2 text-[10px] font-bold text-white/60 transition-all"
                         >
                           +₹{val}
                         </button>
                       ))}
                    </div>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                       <CreditCard className="w-5 h-5 text-indigo-400 shrink-0" />
                       <div>
                          <div className="text-[10px] font-black uppercase text-white tracking-widest">Secure Checkout</div>
                          <div className="text-[10px] text-white/40 mt-1">SSL Encrypted • Instant Settlement</div>
                       </div>
                    </div>
                    
                    <button 
                      disabled={isProcessing || !amount || parseFloat(amount) < 100}
                      onClick={paymentMode === 'cashfree' ? handleCashfreePayment : handleRazorpayPayment}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:grayscale text-white font-black uppercase tracking-widest py-5 rounded-2xl shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-3 active:scale-95 group"
                    >
                      {isProcessing ? 'Processing...' : <><Zap className="w-5 h-5 fill-current" /> Pay with {paymentMode === 'cashfree' ? 'Cashfree' : 'Razorpay'} <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                 </div>
              </div>
            ) : (
              <div className="space-y-8">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-4">
                       <div className="bg-white p-3 rounded-2xl aspect-square flex items-center justify-center shadow-xl border-4 border-white/5">
                          {settings.currentQrCode ? (
                            <img src={settings.currentQrCode} alt="UPI QR" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          ) : <QrCode className="w-20 h-20 text-black/10" />}
                       </div>
                       <div className="text-center">
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">UPI ID</p>
                          <div className="flex items-center justify-center gap-2">
                             <span className="text-sm font-mono font-bold text-[#F27D26]">{settings.currentUpiId || 'admin@upi'}</span>
                             <button onClick={() => {navigator.clipboard.writeText(settings.currentUpiId || ''); alert('Copied!')}} className="p-1.5 hover:bg-white/5 rounded-lg">
                               <ClipboardCheck className="w-3 h-3 text-white/40" />
                             </button>
                          </div>
                       </div>
                    </div>

                    <form onSubmit={handleManualSubmit} className="space-y-4">
                       <div className="space-y-1.5">
                          <label className="text-[9px] font-bold uppercase text-white/40 tracking-widest ml-1">Amount</label>
                          <input 
                            type="number" required placeholder="₹ 100"
                            value={amount} onChange={(e) => setAmount(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm font-bold font-mono outline-none focus:border-[#F27D26] text-white"
                          />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[9px] font-bold uppercase text-white/40 tracking-widest ml-1">Transaction ID (UTR)</label>
                          <input 
                            type="text" required placeholder="12-digit number"
                            value={txnId} onChange={(e) => setTxnId(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm font-bold font-mono outline-none focus:border-[#F27D26] text-white"
                          />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[9px] font-bold uppercase text-white/40 tracking-widest ml-1">Payment Proof</label>
                          <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-all overflow-hidden group relative">
                             {proofUrl ? (
                               <img src={proofUrl} className="w-full h-full object-contain max-h-[120px]" referrerPolicy="no-referrer" />
                             ) : (
                               <div className="text-center">
                                  <Camera className="w-6 h-6 text-white/20 mx-auto mb-1" />
                                  <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Select Screenshot</span>
                               </div>
                             )}
                             <input type="file" className="hidden" accept="image/*" required={!proofUrl} onChange={handleImageUpload} />
                          </label>
                       </div>
                       <button type="submit" className="w-full bg-[#F27D26] hover:bg-[#ff8c3a] text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-lg shadow-[#F27D26]/20 transition-all mt-4 active:scale-95 text-xs">
                         Verify Manually
                       </button>
                    </form>
                 </div>
                 <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                    <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-400 font-medium leading-relaxed italic">Important: Manual deposits take 15-30 minutes for verification. For instant credits, please use the Automated "Instant Pay" mode.</p>
                 </div>
              </div>
            )}
          </div>
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
