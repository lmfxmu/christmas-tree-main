import React, { useState, Suspense, useContext, useEffect, useRef } from 'react';
import { TreeContextType, AppState, TreeContext, PointerCoords } from './types';
import Experience from './components/Experience';
// import GestureInput from './components/GestureInput'; // 不需要了
import TechEffects from './components/TechEffects';
import { AnimatePresence, motion } from 'framer-motion';

// --- 梦幻光标组件 (保持不变) ---
const DreamyCursor: React.FC<{ pointer: PointerCoords | null, progress: number }> = ({ pointer, progress }) => {
    if (!pointer) return null;
    return (
        <motion.div
            className="fixed top-0 left-0 pointer-events-none z-[200]"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
                opacity: 1,
                scale: 1,
                // 这里确保光标跟随鼠标位置
                left: `${pointer.x * 100}%`,
                top: `${pointer.y * 100}%`
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0, ease: "linear" }} // 修改：鼠标移动需要即时响应，去掉延迟
            style={{ x: "-50%", y: "-50%" }}
        >
            {/* 核心光点 */}
            <div className={`rounded-full transition-all duration-300 ${progress > 0.8 ? 'w-4 h-4 bg-emerald-400 shadow-[0_0_20px_#34d399]' : 'w-2 h-2 bg-amber-200 shadow-[0_0_15px_#fcd34d]'}`} />

            {/* 进度光环 - 魔法符文风格 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/20 animate-spin-slow"></div>

            <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 -rotate-90 overflow-visible">
                <defs>
                    <linearGradient id="magicGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#fbbf24" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                        <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>
                {/* 倒计时圆环 */}
                <circle
                    cx="24" cy="24" r="20"
                    fill="none"
                    stroke="url(#magicGradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="125.6"
                    strokeDashoffset={125.6 * (1 - progress)}
                    filter="url(#glow)"
                    className="transition-[stroke-dashoffset] duration-75 ease-linear"
                />
            </svg>

            {/* 粒子拖尾装饰 (CSS 动画) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-gradient-to-r from-emerald-500/10 to-amber-500/10 rounded-full blur-xl animate-pulse"></div>
        </motion.div>
    );
};

// --- 照片弹窗 (保持不变) ---
const PhotoModal: React.FC<{ url: string | null, onClose: () => void }> = ({ url, onClose }) => {
    if (!url) return null;
    return (
        <motion.div
            id="photo-modal-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm cursor-auto" // 恢复弹窗内的鼠标样式
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.8, y: 50, rotate: -5 }}
                animate={{ scale: 1, y: 0, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, y: 100 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="relative max-w-4xl max-h-full bg-white p-3 rounded shadow-[0_0_50px_rgba(255,215,0,0.3)] border-8 border-white"
                onClick={(e) => e.stopPropagation()}
            >
                <img src={url} alt="Memory" className="max-h-[80vh] object-contain rounded shadow-inner" />
                <div className="absolute -bottom-12 w-full text-center text-red-300/70 cinzel text-sm">
                    ❄️ Precious Moment ❄️ Tap to close
                </div>
            </motion.div>
        </motion.div>
    );
}

const AppContent: React.FC = () => {
    // 移除了 webcamEnabled 相关解构，因为不再需要
    const { state, setState, pointer, hoverProgress, setPointer, setHoverProgress, setClickTrigger, selectedPhotoUrl, setSelectedPhotoUrl, clickTrigger } = useContext(TreeContext) as TreeContextType;

    // --- 核心修改：使用鼠标/触摸板代替手势 ---
    useEffect(() => {
        // 1. 鼠标移动：更新 pointer 坐标 (0到1之间)
        const handleMouseMove = (e: MouseEvent) => {
            setPointer({
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight
            });
        };

        // 2. 鼠标按下：模拟手势捏合开始 (视觉上填满圆环)
        const handleMouseDown = () => {
            setHoverProgress(1); 
        };

        // 3. 鼠标抬起：触发点击逻辑 + 重置圆环
        const handleMouseUp = () => {
            setHoverProgress(0);
            // 增加点击计数器，这会通知 Experience 组件执行射线检测
            setClickTrigger(prev => prev + 1);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [setPointer, setHoverProgress, setClickTrigger]);
    // ------------------------------------------

    // 处理点击弹窗背景关闭 (逻辑保持不变)
    useEffect(() => {
        if (selectedPhotoUrl && pointer) {
            // 注意：这里我们使用真实的鼠标事件坐标进行检测会更准确，
            // 但如果 Experience 依赖 pointer 状态，上面的 mousemove 已经处理了
            const x = pointer.x * window.innerWidth;
            const y = pointer.y * window.innerHeight;
            const element = document.elementFromPoint(x, y);
            if (element) {
                const isBackdrop = element.id === 'photo-modal-backdrop';
                if (isBackdrop) setSelectedPhotoUrl(null);
            }
        }
    }, [clickTrigger]); // 依赖 clickTrigger，当点击发生时检查

    // 键盘控制 (保持不变)
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                setState(prev => prev === 'CHAOS' ? 'FORMED' : 'CHAOS');
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [setState]);

    return (
        <main className="relative w-full h-screen bg-black text-white overflow-hidden cursor-none">
            {/* 删除了 GestureInput */}
            
            {/* 3D 场景层 (z-10) */}
            <div className="absolute inset-0 z-10" 
                 // 确保点击事件能穿透到 Canvas，或者直接在 main 上捕获
                 onClick={() => setClickTrigger(prev => prev + 1)}
            >
                <Suspense fallback={<div className="flex items-center justify-center h-full text-red-400 cinzel animate-pulse text-2xl">🎄 Loading Christmas Magic... ❄️</div>}>
                    <Experience />
                </Suspense>
            </div>

            {/* 科技感特效层 - 只有当有交互时才显示，或者你可以永久保留 */}
            {/* <TechEffects /> */}

            {/* UI 层 (z-30) */}
            <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-8">
                <header className="flex justify-between items-start">
                    <div>
                        <h1 className="text-4xl md:text-6xl font-bold cinzel text-transparent bg-clip-text bg-gradient-to-r from-red-300 via-green-200 to-amber-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                            🎄 CHRISTMAS MEMORIES ❄️
                        </h1>
                        <p className="text-red-400/80 cinzel tracking-widest text-sm mt-2">
                            {state === 'CHAOS' ? '✨ SCATTERED MEMORIES // EXPLORE YOUR JOURNEY ✨' : '🎁 MEMORY TREE // TIMELINE OF LOVE 🎁'}
                        </p>
                    </div>
                </header>
            </div>

            {/* 光标层 (z-200) */}
            <DreamyCursor pointer={pointer} progress={hoverProgress} />

            {/* 弹窗层 (z-100) */}
            <AnimatePresence>
                {selectedPhotoUrl && <PhotoModal url={selectedPhotoUrl} onClose={() => setSelectedPhotoUrl(null)} />}
            </AnimatePresence>
        </main>
    );
};

const App: React.FC = () => {
    const [state, setState] = useState<AppState>('CHAOS');
    const [rotationSpeed, setRotationSpeed] = useState<number>(0.3);
    const [rotationBoost, setRotationBoost] = useState<number>(0);
    // webcamEnabled 默认设为 false，或者完全移除
    const [webcamEnabled, setWebcamEnabled] = useState<boolean>(false); 

    const [pointer, setPointer] = useState<PointerCoords | null>({ x: 0.5, y: 0.5 }); // 初始化在屏幕中心
    const [hoverProgress, setHoverProgress] = useState<number>(0);
    const [clickTrigger, setClickTrigger] = useState<number>(0);
    const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
    const [panOffset, setPanOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [zoomOffset, setZoomOffset] = useState<number>(0);

    return (
        <TreeContext.Provider value={{
            state, setState,
            rotationSpeed, setRotationSpeed,
            webcamEnabled, setWebcamEnabled,
            pointer, setPointer,
            hoverProgress, setHoverProgress,
            clickTrigger, setClickTrigger,
            selectedPhotoUrl, setSelectedPhotoUrl,
            panOffset, setPanOffset,
            rotationBoost, setRotationBoost,
            zoomOffset, setZoomOffset
        }}>
            <AppContent />
        </TreeContext.Provider>
    );
};

export default App;