import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
//video.muted = false; 原为true 在156行进行添加修改
//video.volume = 1;新增
//240行 去掉 <video muted> 标签属性 去掉 //muted 属性
type IntroMediaPreludeProps = {
  visible: boolean;
  playbackKey: number;
  stopKey: number;
  videoSrc: string;
  audioSrc: string;
  audioEnergyRef?: MutableRefObject<number>;
  onVideoEnded: () => void;
  onVideoError: () => void;
  onAudioError: () => void;
};

type AudioAnalyzerState = {
  context: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
  data: Uint8Array<ArrayBuffer>;
  frame: number | null;
  smoothedEnergy: number;
};

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function IntroMediaPrelude({
  visible,
  playbackKey,
  stopKey,
  videoSrc,
  audioSrc,
  audioEnergyRef,
  onVideoEnded,
  onVideoError,
  onAudioError,
}: IntroMediaPreludeProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnavailableRef = useRef(false);
  const analyzerRef = useRef<AudioAnalyzerState | null>(null);
  const [needsManualStart, setNeedsManualStart] = useState(false);

  const stopAnalyzerLoop = useCallback(
    (resetEnergy = true) => {
      const analyzer = analyzerRef.current;
      if (analyzer?.frame !== null && analyzer?.frame !== undefined) {
        window.cancelAnimationFrame(analyzer.frame);
        analyzer.frame = null;
      }
      if (resetEnergy && audioEnergyRef) {
        audioEnergyRef.current = 0;
      }
    },
    [audioEnergyRef],
  );

  const ensureAnalyzer = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return null;
    }

    if (!analyzerRef.current) {
      const AudioContextClass = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      analyzerRef.current = {
        context,
        analyser,
        source,
        data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
        frame: null,
        smoothedEnergy: 0,
      };
    }

    if (analyzerRef.current.context.state === "suspended") {
      await analyzerRef.current.context.resume();
    }

    return analyzerRef.current;
  }, []);

  const startAnalyzerLoop = useCallback(async () => {
    if (!audioEnergyRef || audioUnavailableRef.current) {
      return;
    }

    const analyzer = await ensureAnalyzer();
    if (!analyzer || analyzer.frame !== null) {
      return;
    }

    const tick = () => {
      analyzer.analyser.getByteFrequencyData(analyzer.data);
      let weighted = 0;
      let weightTotal = 0;
      for (let i = 0; i < analyzer.data.length; i += 1) {
        const lowMidBias = i < analyzer.data.length * 0.42 ? 1.25 : 0.72;
        weighted += analyzer.data[i] * lowMidBias;
        weightTotal += 255 * lowMidBias;
      }
      const raw = weightTotal > 0 ? weighted / weightTotal : 0;
      const lifted = Math.min(1, Math.max(0, (raw - 0.035) * 3.2));
      analyzer.smoothedEnergy += (lifted - analyzer.smoothedEnergy) * 0.18;
      audioEnergyRef.current = analyzer.smoothedEnergy;
      analyzer.frame = window.requestAnimationFrame(tick);
    };

    tick();
  }, [audioEnergyRef, ensureAnalyzer]);

  const markAudioUnavailable = useCallback(() => {
    if (audioUnavailableRef.current) {
      return;
    }
    audioUnavailableRef.current = true;
    stopAnalyzerLoop();
    onAudioError();
  }, [onAudioError, stopAnalyzerLoop]);

  const stopMedia = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    stopAnalyzerLoop();
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setNeedsManualStart(false);
  }, [stopAnalyzerLoop]);

  const startMedia = useCallback(
    async (manual = false) => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video) {
        return;
      }

      setNeedsManualStart(false);
      video.muted = false;
      video.volume = 1;
      video.currentTime = 0;

      if (audio && !audioUnavailableRef.current) {
        audio.currentTime = 0;
        await ensureAnalyzer();
      }

      try {
        const videoPlay = video.play();
        const audioPlay = audio && !audioUnavailableRef.current ? audio.play() : Promise.resolve();
        await videoPlay;
        try {
          await audioPlay;
          void startAnalyzerLoop();
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
    [ensureAnalyzer, markAudioUnavailable, onVideoError, startAnalyzerLoop],
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
    return () => {
      stopMedia();
      const analyzer = analyzerRef.current;
      analyzer?.source.disconnect();
      analyzer?.analyser.disconnect();
      void analyzer?.context.close();
      analyzerRef.current = null;
    };
  }, [stopMedia]);

  return (
    <>
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="auto"
        onEnded={() => stopAnalyzerLoop()}
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
            //muted
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
