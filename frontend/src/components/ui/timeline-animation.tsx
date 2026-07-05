"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

export function TimelineContent({
  children,
  animationNum = 0,
  timelineRef,
  customVariants,
  className,
  as: Component = "div",
}: {
  children?: ReactNode;
  animationNum?: number;
  timelineRef?: any;
  customVariants?: any;
  className?: string;
  as?: any;
}) {
  const MotionComponent = motion(Component);
  
  return (
    <MotionComponent
      className={className}
      custom={animationNum}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={customVariants}
    >
      {children}
    </MotionComponent>
  );
}
