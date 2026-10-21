import styles from '@/views/styles/app.module.css';

export function UserAvatar({
  name,
  initials,
  src,
  size = 'small',
}: {
  name: string;
  initials: string;
  src?: string;
  size?: 'small' | 'large';
}) {
  const className = size === 'large' ? styles.avatarLarge : styles.avatar;
  const pixelSize = size === 'large' ? 50 : 34;
  return (
    <span className={className} data-profile-avatar role="img" aria-label={`${name} profile photo`}>
      {src ? <img src={src} alt="" width={pixelSize} height={pixelSize} decoding="async" /> : initials}
    </span>
  );
}
