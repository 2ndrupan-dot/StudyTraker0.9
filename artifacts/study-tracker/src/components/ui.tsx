import React from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2 } from 'lucide-react';

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: 'bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border-2 border-border bg-transparent hover:bg-secondary/50',
      ghost: 'bg-transparent hover:bg-secondary/50 text-muted-foreground hover:text-foreground',
      danger: 'bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground',
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        <input
          ref={ref}
          className={cn(
            "flex h-12 w-full rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 shadow-sm",
            error && "border-destructive focus-visible:ring-destructive/20",
            className
          )}
          {...props}
        />
        {error && <span className="text-xs text-destructive px-1">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export const Modal = ({
  isOpen, onClose, title, children, icon: Icon, align = 'center'
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  icon?: any;
  align?: 'center' | 'bottom';
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Transparent click-outside overlay — no dark background on full screen */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 max-w-md mx-auto"
            style={{ cursor: 'default' }}
          />

          {/* Modal sheet container */}
          <div className={cn(
            "fixed inset-0 z-50 max-w-md mx-auto pointer-events-none flex",
            align === 'bottom' ? 'items-end' : 'items-center justify-center p-4'
          )}>
            <motion.div
              initial={align === 'bottom' ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
              animate={align === 'bottom' ? { y: 0 } : { opacity: 1, scale: 1 }}
              exit={align === 'bottom' ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={cn(
                "w-full bg-card pointer-events-auto flex flex-col overflow-hidden",
                align === 'bottom'
                  ? "rounded-t-3xl pb-8 shadow-[0_-8px_40px_rgba(0,0,0,0.18)] border-t border-x border-border/60"
                  : "rounded-3xl max-h-[85vh] shadow-2xl border border-border/60"
              )}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-border/50">
                <div className="flex items-center gap-3">
                  {Icon && <div className="p-2 bg-primary/10 rounded-full text-primary"><Icon size={20} /></div>}
                  <h2 className="text-lg font-bold text-foreground">{title}</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 -mr-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto no-scrollbar">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── Note Editor Modal (with expand to A4 full-screen) ────────────────────────
export const NoteEditorModal = ({
  isOpen, onClose, value, onChange, onClear, onSave,
  title, placeholder, clearLabel, saveLabel, icon: Icon,
}: {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  onSave: () => void;
  title: string;
  placeholder?: string;
  clearLabel: string;
  saveLabel: string;
  icon?: any;
}) => {
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) setExpanded(false);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: expanded ? 1 : 0.01 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className={cn(
              "fixed inset-0 z-50 transition-colors",
              expanded ? "bg-black/50" : ""
            )}
          />

          <AnimatePresence mode="wait">
            {expanded ? (
              /* ── A4 full-screen expanded view ── */
              <motion.div
                key="expanded"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 pointer-events-none"
              >
                <div
                  className="w-full max-w-[794px] bg-card rounded-3xl shadow-2xl border border-border/60 flex flex-col pointer-events-auto overflow-hidden"
                  style={{ height: 'min(90vh, 1123px)' }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50 shrink-0">
                    {Icon && (
                      <div className="p-2 bg-primary/10 rounded-full text-primary shrink-0">
                        <Icon size={20} />
                      </div>
                    )}
                    <h2 className="text-lg font-bold text-foreground flex-1 min-w-0 truncate">{title}</h2>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setExpanded(false)}
                        className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
                        title="Minimize"
                      >
                        <Minimize2 size={18} />
                      </button>
                      <button
                        onClick={onClose}
                        className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden min-h-0">
                    <textarea
                      autoFocus
                      value={value}
                      onChange={e => onChange(e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 w-full p-4 rounded-xl border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none min-h-0"
                    />
                    <div className="flex gap-2 shrink-0">
                      <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={onClear}>
                        {clearLabel}
                      </Button>
                      <Button className="flex-1" onClick={onSave}>
                        {saveLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* ── Compact bottom sheet ── */
              <motion.div
                key="compact"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-card rounded-t-3xl pb-8 shadow-[0_-8px_40px_rgba(0,0,0,0.18)] border-t border-x border-border/60 pointer-events-auto"
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    {Icon && (
                      <div className="p-2 bg-primary/10 rounded-full text-primary">
                        <Icon size={20} />
                      </div>
                    )}
                    <h2 className="text-lg font-bold text-foreground">{title}</h2>
                  </div>
                  <div className="flex items-center gap-1 -mr-2">
                    <button
                      onClick={() => setExpanded(true)}
                      className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
                      title="Expand to A4"
                    >
                      <Maximize2 size={18} />
                    </button>
                    <button
                      onClick={onClose}
                      className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                  <textarea
                    autoFocus
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    rows={5}
                    placeholder={placeholder}
                    className="w-full p-3 rounded-xl border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={onClear}>
                      {clearLabel}
                    </Button>
                    <Button className="flex-1" onClick={onSave}>
                      {saveLabel}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};

export const ConfirmModal = ({
  isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", isDanger = false
}: any) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} align="center">
      <p className="text-muted-foreground mb-8 leading-relaxed">{message}</p>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>{cancelText}</Button>
        <Button variant={isDanger ? "danger" : "primary"} className="flex-1" onClick={() => { onConfirm(); onClose(); }}>{confirmText}</Button>
      </div>
    </Modal>
  );
};
