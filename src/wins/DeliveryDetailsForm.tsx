import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api/errors';
import { useAuth } from '../auth/useAuth';
import { Alert, Button, Field } from '../components/ui';
import {
  deliveryErrors,
  deliverySaveMessage,
  initialDeliveryForm,
  toDeliveryDetails,
  type DeliveryField,
  type DeliveryForm,
} from './delivery';
import { useSubmitDeliveryDetails, type MyWin } from './queries';
import { t } from '../i18n/i18n';

/** Who receives the prize, the number to call and the city. Saving again replaces what was sent before. */
export function DeliveryDetailsForm({
  win,
  onSaved,
  onCancel,
}: {
  win: MyWin;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const save = useSubmitDeliveryDetails();
  const [form, setForm] = useState<DeliveryForm>(() =>
    initialDeliveryForm(win, { fullName: user?.fullName ?? null, phoneNumber: user?.phoneNumber ?? '' }),
  );
  const [checked, setChecked] = useState(false);
  const errors = checked ? deliveryErrors(form) : {};

  const field = (name: DeliveryField) => ({
    value: form[name],
    error: errors[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setChecked(true);
    if (Object.keys(deliveryErrors(form)).length > 0) return;
    save.mutate({ winId: win.id, details: toDeliveryDetails(form) }, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={submit} noValidate aria-label={t('Delivery details')} className="mt-4 space-y-4">
      {save.isError && <Alert>{deliverySaveMessage(save.error) ?? errorMessage(save.error)}</Alert>}
      <Field label={t("Recipient's full name")} required autoComplete="name" {...field('recipientName')} />
      <Field
        label={t("Recipient's phone number")}
        required
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint={t('We call this number to arrange the delivery.')}
        {...field('recipientPhone')}
      />
      <Field label={t('City or town')} required autoComplete="address-level2" {...field('city')} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" busy={save.isPending}>
          {t('Save delivery details')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={save.isPending}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}
