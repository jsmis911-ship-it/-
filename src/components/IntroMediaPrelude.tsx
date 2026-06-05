import { useCallback, useEffect, useRef, useState } from "react";

type IntroMediaPreludeProps = {
  visible: boolean;
  playbackKey: number;
  stopKey: number;
  videoSrc: string;
  audioSrc: string;
  onVideoEnded: () => void;
  onVideoError: () => void;
  onAudioError: () => void;
};

export function IntroMediaPrelude({
  visible,
  playbackKey,
  stopKey,
  videoSrc,
  audioSrc,
  onVideoEnded,
  onVideoError,
  onAudioError,
}: IntroMediaPreludeProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnavailableRef = useRef(false);
  const [needsManualStart, setNeedsManualStart] = useState(false);

  const markAudioUnavailable = useCallback(() => {
    if (audioUnavailableRef.current) {
      return;
    }
    audioUnavailableRef.current = true;
    onAudioError();
  }, [onAudioError]);

  const stopMedia = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setNeedsManualStart(false);
  }, []);

  const startMedia = useCallback(
    async (manual = false) => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video) {
        return;
      }

      setNeedsManualStart(false);
      video.muted = true;
      video.currentTime = 0;

      if (audio && !audioUnavailableRef.current) {
        audio.currentTime = 0;
      }

      try {
        const videoPlay = video.play();
        const audioPlay = audio && !audioUnavailableRef.current ? audio.play() : Promise.resolve();
        await videoPlay;
        try {
          await audioPlay;
        } catch (error) {
          if (!manual && isAutoplayBlocked(error)) {
            video.pause();
            video.currentTime = 0;
            if (audio) {
              audio.pause();
              audio.currentTime = 0;
            }
            setNeedsManualStart(true);
            return;
          }
          markAudioUnavailable();
        }
      } catch (error) {
        if (!manual && isAutoplayBlocked(error)) {
          setNeedsManualStart(true);
          return;
        }
        onVideoError();
      }
    },
    [markAudioUnavailable, onVideoError],
  );

  useEffect(() => {
    stopMedia();
  }, [stopKey, stopMedia]);

  useEffect(() => {
    if (!visible) {
      setNeedsManualStart(false);
      return;
    }

    audioUnavailableRef.current = false;
    void startMedia(false);
  }, [playbackKey, startMedia, visible]);

  useEffect(() => {
    return () => stopMedia();
  }, [stopMedia]);

  return (
    <>
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="auto"
        onError={() => {
          markAudioUnavailable();
        }}
      />
      {visible && (
        <section className="intro-media-prelude" aria-label="开场视频">
          <video
            ref={videoRef}
            className="intro-media-video"
            src={videoSrc}
            muted
            playsInline
            preload="auto"
            onEnded={onVideoEnded}
            onError={onVideoError}
          />
          <div className="intro-media-vignette" aria-hidden="true" />
          {needsManualStart && (
            <button className="intro-start-button" type="button" onClick={() => void startMedia(true)}>
              开始播放
            </button>
          )}
        </section>
      )}
    </>
  );
}

function isAutoplayBlocked(error: unknown) {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}
