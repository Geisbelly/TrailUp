import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DeckData } from '../types';
import { VisualKnowledgeGraph } from './VisualKnowledgeGraph';

interface KnowledgeGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckData;
  currentSlideIndex: number;
  onSelectSlide: (index: number) => void;
}

export const KnowledgeGraphModal: React.FC<KnowledgeGraphModalProps> = ({
  isOpen,
  onClose,
  deck,
  currentSlideIndex,
  onSelectSlide,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md overflow-hidden">
        {/* Backdrop click */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0"
          onClick={onClose}
        />

        {/* Modal Window Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
          className="relative z-10 w-full max-w-6xl h-[90vh] max-h-[850px] flex flex-col"
        >
          <VisualKnowledgeGraph
            deck={deck}
            currentSlideIndex={currentSlideIndex}
            onSelectSlide={onSelectSlide}
            onClose={onClose}
            className="flex-1 shadow-2xl"
          />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
