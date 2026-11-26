import type { ToastMessage } from '../types';

interface ToastNotificationProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function ToastNotification({ toast, onDismiss }: ToastNotificationProps) {
  if (!toast) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className={`toast${toast.variant === 'error' ? ' is-error' : ''}`}>
        <span>{toast.text}</span>
        <button
          type="button"
          className="toast-close"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
