import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface SlotItem {
  id: string;
  image: string;
  label: string;
  tag?: string;
  tagColor?: string;
}

interface SlotMachineHeroPreviewProps {
  isDark: boolean;
}

const SLOT_DATA: { category: string; color: string; items: SlotItem[] }[] = [
  {
    category: 'ภาพปก',
    color: 'bg-orange-500',
    items: [
      {
        id: 'c1',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/cover/cover-10.png',
        label: 'ภาพปก',
        tag: 'ปกแคมเปญ',
        tagColor: 'bg-orange-500/90 text-white',
      },
      {
        id: 'c2',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/cover-06.jpeg',
        label: 'ภาพปก',
        tag: 'สินค้าหลัก',
        tagColor: 'bg-amber-500/90 text-white',
      },
      {
        id: 'c3',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/cover-07.jpeg',
        label: 'ภาพปก',
        tag: 'ลดพิเศษ',
        tagColor: 'bg-rose-500/90 text-white',
      },
      {
        id: 'c4',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/cover-08.jpeg',
        label: 'ภาพปก',
        tag: 'พร้อมส่ง',
        tagColor: 'bg-emerald-500/90 text-white',
      },
    ],
  },
  {
    category: 'จุดเด่น',
    color: 'bg-cyan-500',
    items: [
      {
        id: 'h1',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/feature/feature-01.png',
        label: 'จุดเด่น',
        tag: 'จุดเด่นสินค้า',
        tagColor: 'bg-cyan-600/90 text-white',
      },
      {
        id: 'h2',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/feature/Feature-%20(02).jpeg',
        label: 'จุดเด่น',
        tag: 'ใช้งานง่าย',
        tagColor: 'bg-blue-600/90 text-white',
      },
      {
        id: 'h3',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/feature/Feature-%20(03).jpeg',
        label: 'จุดเด่น',
        tag: 'คุณภาพสูง',
        tagColor: 'bg-teal-600/90 text-white',
      },
      {
        id: 'h4',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/feature/Feature-%20(04).jpeg',
        label: 'จุดเด่น',
        tag: 'สเปกครบถ้วน',
        tagColor: 'bg-purple-600/90 text-white',
      },
    ],
  },
  {
    category: 'ขนาดจริง',
    color: 'bg-violet-500',
    items: [
      {
        id: 's1',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/size-01.png',
        label: 'ขนาดจริง',
        tag: 'ขนาดสินค้า 01',
        tagColor: 'bg-violet-600/90 text-white',
      },
      {
        id: 's2',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/size-12.png',
        label: 'ขนาดจริง',
        tag: 'ขนาดสินค้า 12',
        tagColor: 'bg-indigo-600/90 text-white',
      },
      {
        id: 's3',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/size-11.png',
        label: 'ขนาดจริง',
        tag: 'ขนาดสินค้า 11',
        tagColor: 'bg-blue-600/90 text-white',
      },
      {
        id: 's4',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/7_SIZE_CHART.png_202607231422.jpeg',
        label: 'ขนาดจริง',
        tag: 'Size Chart 07',
        tagColor: 'bg-teal-600/90 text-white',
      },
      {
        id: 's5',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/SIZE_03.png_202607231422.jpeg',
        label: 'ขนาดจริง',
        tag: 'Size Chart 03',
        tagColor: 'bg-amber-600/90 text-white',
      },
      {
        id: 's6',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/SIZE_CHART.png_202607231422.jpeg',
        label: 'ขนาดจริง',
        tag: 'Size Chart หลัก',
        tagColor: 'bg-orange-600/90 text-white',
      },
      {
        id: 's7',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/size-02.png_202607231422.jpeg',
        label: 'ขนาดจริง',
        tag: 'ขนาดสินค้า 02',
        tagColor: 'bg-rose-600/90 text-white',
      },
      {
        id: 's8',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/size-09.jpeg',
        label: 'ขนาดจริง',
        tag: 'ขนาดสินค้า 09',
        tagColor: 'bg-pink-600/90 text-white',
      },
      {
        id: 's9',
        image: 'https://6a61a95d2c9be6b62f95a2a6.imgix.net/size/size-099.jpeg',
        label: 'ขนาดจริง',
        tag: 'ขนาดสินค้า 99',
        tagColor: 'bg-purple-600/90 text-white',
      },
    ],
  },
];

export const SlotMachineHeroPreview: React.FC<SlotMachineHeroPreviewProps> = ({ isDark }) => {
  const [indexes, setIndexes] = useState<number[]>([0, 0, 0]);
  const [spinning, setSpinning] = useState<boolean[]>([true, true, true]);
  const [blurAmount, setBlurAmount] = useState<number[]>([6, 6, 6]);
  const autoLoopRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartRef = useRef<{ slotIdx: number; startY: number } | null>(null);

  // Helper for safe wrapping modulo per slot count
  const nextIdx = (slotIdx: number, current: number, direction: 'down' | 'up') => {
    const total = SLOT_DATA[slotIdx].items.length;
    if (direction === 'down') {
      return (current + 1) % total;
    } else {
      return (current - 1 + total) % total;
    }
  };

  // 1. Initial Arcade Slot Machine Spinning Effect on page load (staggered decelerations)
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    timers.push(
      setTimeout(() => {
        setSpinning((prev) => [false, prev[1], prev[2]]);
        setBlurAmount((prev) => [0, prev[1], prev[2]]);
      }, 1000)
    );

    timers.push(
      setTimeout(() => {
        setSpinning((prev) => [prev[0], false, prev[2]]);
        setBlurAmount((prev) => [prev[0], 0, prev[2]]);
      }, 1500)
    );

    timers.push(
      setTimeout(() => {
        setSpinning((prev) => [prev[0], prev[1], false]);
        setBlurAmount((prev) => [prev[0], prev[1], 0]);
      }, 2000)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  // Rapid ticker frame for initial spinning visual blur effect
  useEffect(() => {
    if (!spinning.some(Boolean)) return;

    const interval = setInterval(() => {
      setIndexes((prev) =>
        prev.map((idx, sIdx) => {
          if (!spinning[sIdx]) return idx;
          const total = SLOT_DATA[sIdx].items.length;
          return sIdx === 1 ? (idx - 1 + total) % total : (idx + 1) % total;
        })
      );
    }, 90);

    return () => clearInterval(interval);
  }, [spinning]);

  // 2. STRICT RULE: Sequential Turn-based Motion (Never move simultaneously!)
  useEffect(() => {
    if (spinning.some(Boolean)) return;

    const timers: NodeJS.Timeout[] = [];

    const scheduleSequentialCycle = () => {
      // Step 1 (t = 0.5s): Left Slot moves DOWN 1 step
      timers.push(
        setTimeout(() => {
          setIndexes((prev) => [ nextIdx(0, prev[0], 'down'), prev[1], prev[2] ]);
        }, 500)
      );

      // Step 2 (t = 1.9s): Middle Slot moves UPWARDS 1 step! (1.4s gap)
      timers.push(
        setTimeout(() => {
          setIndexes((prev) => [ prev[0], nextIdx(1, prev[1], 'up'), prev[2] ]);
        }, 1900)
      );

      // Step 3 (t = 3.3s): Right Slot moves DOWN 1 step! (1.4s gap)
      timers.push(
        setTimeout(() => {
          setIndexes((prev) => [ prev[0], prev[1], nextIdx(2, prev[2], 'down') ]);
        }, 3300)
      );
    };

    // Run cycle first time after initial spin
    scheduleSequentialCycle();

    // Repeat cycle every 5.2 seconds
    autoLoopRef.current = setInterval(() => {
      scheduleSequentialCycle();
    }, 5200);

    return () => {
      if (autoLoopRef.current) clearInterval(autoLoopRef.current);
      timers.forEach(clearTimeout);
    };
  }, [spinning]);

  const resetAutoTimer = () => {
    if (autoLoopRef.current) clearInterval(autoLoopRef.current);
    autoLoopRef.current = setInterval(() => {
      setIndexes((prev) => [ nextIdx(0, prev[0], 'down'), prev[1], prev[2] ]);
    }, 6000);
  };

  // 3. Interactive Wheel & Drag handlers for scrolling slots manually
  const handleWheel = (slotIdx: number, deltaY: number) => {
    resetAutoTimer();
    setIndexes((prev) => {
      const next = [...prev];
      if (slotIdx === 1) {
        // Middle slot wheel inverted
        next[slotIdx] = deltaY > 0 ? nextIdx(slotIdx, next[slotIdx], 'up') : nextIdx(slotIdx, next[slotIdx], 'down');
      } else {
        next[slotIdx] = deltaY > 0 ? nextIdx(slotIdx, next[slotIdx], 'down') : nextIdx(slotIdx, next[slotIdx], 'up');
      }
      return next;
    });
  };

  const handlePointerDown = (slotIdx: number, clientY: number) => {
    dragStartRef.current = { slotIdx, startY: clientY };
  };

  const handlePointerUp = (slotIdx: number, clientY: number) => {
    if (!dragStartRef.current || dragStartRef.current.slotIdx !== slotIdx) return;
    const diffY = clientY - dragStartRef.current.startY;
    dragStartRef.current = null;

    if (Math.abs(diffY) > 20) {
      resetAutoTimer();
      setIndexes((prev) => {
        const next = [...prev];
        if (slotIdx === 1) {
          next[slotIdx] = diffY < 0 ? nextIdx(slotIdx, next[slotIdx], 'up') : nextIdx(slotIdx, next[slotIdx], 'down');
        } else {
          next[slotIdx] = diffY < 0 ? nextIdx(slotIdx, next[slotIdx], 'down') : nextIdx(slotIdx, next[slotIdx], 'up');
        }
        return next;
      });
    }
  };

  return (
    <div className={`rounded-2xl p-5 ${isDark ? 'bg-[#0a1425]' : 'bg-slate-50'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>แคมเปญสินค้า</p>
          <p className="mt-1 text-base font-black tracking-tight text-orange-500 flex items-center gap-2">
            ตัวอย่างภาพ
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20">
                เปลี่ยนไอเดียสินค้าเป็นภาพพร้อมขาย
            </span>
          </p>
        </div>
        <span className="rounded-lg bg-orange-500/15 px-2.5 py-1 text-[10px] font-black text-orange-500 animate-pulse">
          พร้อมสร้าง
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {SLOT_DATA.map((col, slotIdx) => {
          const activeIndex = indexes[slotIdx];
          const isSlotSpinning = spinning[slotIdx];

          return (
            <div key={col.category} className="group relative flex flex-col items-center">
              <button
                onClick={() => handleWheel(slotIdx, -1)}
                className={`absolute -top-3 z-20 rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity ${
                  isDark ? 'bg-slate-800 text-white border border-white/20' : 'bg-white text-slate-800 border border-slate-200'
                }`}
                title="เลื่อนขึ้น"
              >
                <ChevronUp className="h-3 w-3" />
              </button>

              <div
                className={`relative w-full aspect-square overflow-hidden rounded-2xl border cursor-grab active:cursor-grabbing select-none transition-all shadow-md ${
                  isDark ? 'border-white/15 bg-slate-900/80 hover:border-orange-500/50' : 'border-slate-200 bg-white hover:border-orange-400'
                }`}
                onWheel={(e) => {
                  e.preventDefault();
                  handleWheel(slotIdx, e.deltaY);
                }}
                onPointerDown={(e) => handlePointerDown(slotIdx, e.clientY)}
                onPointerUp={(e) => handlePointerUp(slotIdx, e.clientY)}
              >
                <div
                  className={`w-full h-full flex flex-col ${
                    isSlotSpinning ? 'transition-none' : 'transition-transform duration-700 ease-out'
                  }`}
                  style={{
                    transform: `translateY(-${activeIndex * 100}%)`,
                    filter: isSlotSpinning ? `blur(${blurAmount[slotIdx]}px)` : 'none',
                  }}
                >
                  {col.items.map((item) => (
                    <div key={item.id} className="relative w-full h-full shrink-0 aspect-square">
                      <img
                        src={item.image}
                        alt={item.label}
                        draggable={false}
                        className="w-full h-full object-cover select-none"
                      />

                      {item.tag && (
                        <span
                          className={`absolute top-2 right-2 rounded-md px-2 py-0.5 text-[9px] font-black shadow-lg backdrop-blur-md ${
                            item.tagColor || 'bg-black/60 text-white'
                          }`}
                        >
                          {item.tag}
                        </span>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-2.5 pt-6 text-left">
                        <p className="text-[10px] font-black text-white tracking-tight leading-tight">
                          {col.category}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_15px_rgba(0,0,0,0.3)]" />
              </div>

              <button
                onClick={() => handleWheel(slotIdx, 1)}
                className={`absolute -bottom-3 z-20 rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity ${
                  isDark ? 'bg-slate-800 text-white border border-white/20' : 'bg-white text-slate-800 border border-slate-200'
                }`}
                title="เลื่อนลง"
              >
                <ChevronDown className="h-3 w-3" />
              </button>

              <div className="mt-2 flex flex-wrap justify-center gap-1 max-w-full px-1">
                {col.items.map((_, dotIdx) => (
                  <span
                    key={dotIdx}
                    onClick={() => {
                      resetAutoTimer();
                      setIndexes((prev) => {
                        const next = [...prev];
                        next[slotIdx] = dotIdx;
                        return next;
                      });
                    }}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      dotIdx === activeIndex
                        ? 'w-3.5 bg-orange-500'
                        : isDark
                        ? 'w-1.5 bg-slate-700 hover:bg-slate-500'
                        : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                    }`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SlotMachineHeroPreview;
