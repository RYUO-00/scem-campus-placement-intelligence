export default function Branding({ subtitle, variant = 'auth-brand' }) {
  return (
    <div className={variant}>
      <picture className="college-logo-picture">
        <source media="(max-width: 780px)" srcSet="/assets/sahyadri-college-logo-compact.svg" />
        <img
          className={`college-logo${variant === 'auth-brand' ? ' college-logo-large' : ''}`}
          src="/assets/sahyadri-college-logo.svg"
          alt="Sahyadri College of Engineering & Management logo"
        />
      </picture>
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}
