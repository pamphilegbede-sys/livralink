import React, { useEffect, useState } from 'react';
import {
  requiresAuthenticatedMediaFetch,
  fetchAuthorizedMediaObjectUrl,
} from '../../firebase/storageService';

interface AuthorizedMediaImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export const AuthorizedMediaImage: React.FC<AuthorizedMediaImageProps> = ({
  src,
  alt,
  className,
  fallback,
}) => {
  const needsAuthFetch = requiresAuthenticatedMediaFetch(src);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(needsAuthFetch ? null : src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    let revokeFn: (() => void) | undefined;

    if (!src) {
      setResolvedSrc(null);
      setHasError(true);
      return () => {};
    }

    if (!needsAuthFetch) {
      setResolvedSrc(src);
      setHasError(false);
      return () => {};
    }

    setResolvedSrc(null);
    setHasError(false);

    fetchAuthorizedMediaObjectUrl(src)
      .then(({ objectUrl, revoke }) => {
        if (!active) {
          revoke();
          return;
        }
        revokeFn = revoke;
        setResolvedSrc(objectUrl);
      })
      .catch(() => {
        if (active) {
          setHasError(true);
        }
      });

    return () => {
      active = false;
      if (revokeFn) {
        revokeFn();
      }
    };
  }, [src, needsAuthFetch]);

  if (hasError) {
    return (
      <>
        {fallback || (
          <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400 p-2 text-center">
            Média protégé inaccessible
          </div>
        )}
      </>
    );
  }

  if (!resolvedSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400 animate-pulse p-2">
        Chargement sécurisé…
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setHasError(true)}
    />
  );
};
