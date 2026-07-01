"use client";

import { motion } from "framer-motion";
import { formatStellarUnits } from "@/lib/publicWalletCore";
import { Eye, Shield } from "lucide-react";

interface NoteStackProps {
  notes: any[]; // Using any for brevity here, should be DecryptedNote
  selectedCommitment: string;
  onSelectNote: (commitmentHex: string) => void;
  openDrawer: (content: React.ReactNode) => void;
}

function shortHash(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-8)}`;
}

export default function NoteStack({ notes, selectedCommitment, onSelectNote, openDrawer }: NoteStackProps) {
  
  if (notes.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-xl bg-stone-50/30 p-8 text-center">
        <Shield className="mb-4 h-8 w-8 text-stone-400" />
        <h3 className="text-sm font-semibold text-stone-900">No notes found</h3>
        <p className="mt-2 text-sm text-stone-500">Your note stack is empty.</p>
      </div>
    );
  }

  // Ensure the selected note is first in the array for rendering (or last to be on top, depending on z-index logic)
  // Let's sort them so the selected one is at the end (highest z-index usually, or we can handle z-index explicitly).
  // Actually, framer-motion handles layout transitions nicely if we just reorder the array.
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.note.commitmentHex === selectedCommitment) return 1; // move to end
    if (b.note.commitmentHex === selectedCommitment) return -1;
    return a.note.createdAt - b.note.createdAt;
  });

  const handleNoteDetails = (note: any, e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger select
    openDrawer(
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-stone-900">Note Details</h3>
          <p className="mt-1 text-sm text-stone-500">Technical details for this shielded note.</p>
        </div>
        
        <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Amount</p>
            <p className="mt-1 font-mono text-sm text-stone-900">{formatStellarUnits(note.note.amountUnits, "USDC")}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Commitment</p>
            <p className="mt-1 break-all font-mono text-sm text-stone-900">{note.note.commitmentHex}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Leaf Index</p>
            <p className="mt-1 font-mono text-sm text-stone-900">{note.note.leafIndex ?? "Pending"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Status</p>
            <p className="mt-1 text-sm text-stone-900 capitalize">{note.row.status.replace("_", " ")}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-[350px] w-full items-center justify-center perspective-[1200px]">
      {sortedNotes.map((item, index) => {
        const isSelected = item.note.commitmentHex === selectedCommitment;
        const total = sortedNotes.length;
        const revIndex = total - 1 - index; // 0 for the top card (selected), 1 for the one behind it, etc.

        // Calculate stacked positions for cards behind the top card
        const yOffset = isSelected ? 0 : revIndex * 15; 
        const scale = isSelected ? 1 : Math.max(0.85, 1 - revIndex * 0.05);
        const zIndex = isSelected ? 50 : 40 - revIndex;

        return (
          <motion.div
            key={item.note.commitmentHex}
            layout
            onClick={() => onSelectNote(item.note.commitmentHex)}
            initial={false}
            animate={{
              y: yOffset,
              scale: scale,
              zIndex: zIndex,
              rotateX: isSelected ? 0 : 5, // slight tilt for cards behind
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
            className={`absolute w-full max-w-sm cursor-pointer overflow-hidden rounded-2xl border p-6 shadow-xl backdrop-blur-xl transition-shadow hover:shadow-2xl ${
              isSelected 
                ? "border-stone-200 bg-white/90" 
                : "border-stone-200/50 bg-white/60"
            }`}
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Ambient glare on the card */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 to-transparent" />
            
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Private Note</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight text-stone-900">
                    {formatStellarUnits(item.note.amountUnits, "")}
                  </span>
                  <span className="text-sm font-medium text-stone-500">USDC</span>
                </div>
              </div>
              
              {isSelected && (
                <button
                  onClick={(e) => handleNoteDetails(item, e)}
                  className="rounded-full bg-stone-100 p-2 text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-900"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="relative mt-8 flex items-end justify-between border-t border-stone-200/50 pt-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-stone-400">Commitment</p>
                <p className="font-mono text-xs text-stone-600">{shortHash(item.note.commitmentHex)}</p>
              </div>
              <Shield className="h-5 w-5 text-stone-300" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
