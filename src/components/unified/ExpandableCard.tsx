"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface CardItem {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  description: string;
  details: React.ReactNode;
  metadata: string;
}

interface ExpandableCardProps {
  items: CardItem[];
  className?: string;
}

export default function ExpandableCard({
  items,
  className,
}: ExpandableCardProps) {
  const [current, setCurrent] = useState<CardItem | null>(null);
  const ref = useOutsideClick(() => setCurrent(null));

  return (
    <div className="w-full">
      <AnimatePresence>
        {current ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-stone-950/20 backdrop-blur-md"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {current ? (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <motion.div
              className="bg-white flex h-fit w-full max-w-4xl cursor-default flex-col items-start gap-4 overflow-hidden rounded-xl border border-stone-200/50 p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
              ref={ref}
              layoutId={`cardItem-${current.id}`}
            >
              <div className="flex w-full items-start gap-4">
                <motion.div layoutId={`cardItemIcon-${current.id}`} className="shrink-0">
                  {current.icon}
                </motion.div>
                <div className="flex grow items-center justify-between min-w-0">
                  <div className="flex w-full flex-col gap-0.5 min-w-0">
                    <div className="flex w-full flex-row justify-between gap-2">
                      <motion.div
                        className="text-stone-950 text-base font-semibold truncate"
                        layoutId={`cardItemTitle-${current.id}`}
                      >
                        {current.title}
                      </motion.div>
                      <button
                        onClick={() => setCurrent(null)}
                        className="text-stone-400 hover:text-stone-600 transition p-1 rounded-full hover:bg-stone-50 shrink-0"
                        aria-label="Close"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <motion.p
                      layoutId={`cardItemSubtitle-${current.id}`}
                      className="text-stone-500 text-xs truncate"
                    >
                      {current.subtitle} {current.description ? `· ${current.description}` : ""}
                    </motion.p>
                    <motion.div
                      className="text-stone-400 flex flex-row gap-2 text-[10px] font-mono mt-1"
                      layoutId={`cardItemMetadata-${current.id}`}
                    >
                      {current.metadata}
                    </motion.div>
                  </div>
                </div>
              </div>
              <motion.div
                layout
                initial={{ opacity: 0, filter: "blur(5px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                transition={{
                  duration: 0.3,
                  ease: "easeInOut",
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.15 },
                  filter: "blur(3px)",
                }}
                className="w-full text-stone-600 text-sm mt-2"
              >
                {current.details}
              </motion.div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <div className={className}>
        <div className="flex w-full flex-col gap-3">
          {items.map((item) => (
            <motion.div
              layoutId={`cardItem-${item.id}`}
              key={item.id}
              initial={{ scale: 1 }}
              whileHover={{ scale: 1.01 }}
              transition={{
                duration: 0.15,
                ease: "easeOut",
              }}
              className="bg-stone-50/50 hover:bg-stone-50 flex w-full cursor-pointer flex-row items-center gap-4 rounded-xl p-4 transition-all duration-200 border border-transparent hover:border-stone-200/50"
              onClick={() => {
                setCurrent(item);
              }}
            >
              <motion.div layoutId={`cardItemIcon-${item.id}`} className="shrink-0">
                {item.icon}
              </motion.div>
              <div className="flex w-full flex-col items-start justify-between gap-0.5 min-w-0">
                <div className="flex w-full justify-between gap-2">
                  <motion.div
                    className="text-stone-950 font-semibold text-sm truncate"
                    layoutId={`cardItemTitle-${item.id}`}
                  >
                    {item.title}
                  </motion.div>
                  <motion.div
                    className="text-stone-400 text-[10px] font-mono shrink-0"
                    layoutId={`cardItemMetadata-${item.id}`}
                  >
                    {item.metadata}
                  </motion.div>
                </div>
                <motion.div
                  className="text-stone-500 text-xs truncate"
                  layoutId={`cardItemSubtitle-${item.id}`}
                >
                  {item.subtitle} {item.description ? `· ${item.description}` : ""}
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

const useOutsideClick = (callback: () => void) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [callback]);

  return ref;
};
