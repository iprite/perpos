'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useLang } from './_lang-context';
import { getPaymentMethods } from './_i18n';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  guestName: string;
  roomNumber: string;
  orgId: string;
  token: string;
  onSuccess: () => void;
}

export default function AddPaymentDialog({
  open, onOpenChange, bookingId, guestName, roomNumber, orgId, token, onSuccess,
}: Props) {
  const { t } = useLang();
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) { setError(t.err_enter_amount); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/usvilla/bookings/${bookingId}?orgId=${orgId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ action: 'add_payment', method, amount: Number(amount) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t.err_load_fail);
      onSuccess(); onOpenChange(false);
      setAmount(''); setMethod('cash');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleClose = (v: boolean) => {
    if (!v) { setAmount(''); setMethod('cash'); setError(''); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.dlg_add_pay_title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          {t.room_label} <strong className="text-slate-800">{roomNumber}</strong> · {guestName}
        </p>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>{t.field_method}</Label>
            <CustomSelect value={method} onChange={setMethod} options={getPaymentMethods(t)} />
          </div>
          <div className="space-y-1">
            <Label>{t.field_amount} *</Label>
            <Input type="number" min="0" step="0.01" placeholder={t.ph_amount}
              value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>{t.btn_cancel}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t.btn_saving : t.btn_save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
