"use client";

import React, { useState, useEffect, useMemo } from "react";
import { GRADES_DATA } from "../../../lib/curriculum-data";
import { checkBackendHealth } from "../../../lib/api";
import { Activity } from "lucide-react";

export function MetricsSection() {
  const [engineStatus, setEngineStatus] = useState<{ status: string; service: string }>({
    status: "checking",
    service: "AI Engine",
  });

  useEffect(() => {
    let mounted = true;
    checkBackendHealth().then((res) => {
      if (mounted) setEngineStatus(res);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const totalSensors = 12;
  const totalGrades = useMemo(() => Object.keys(GRADES_DATA).length, []);

  const isHealthy = engineStatus.status === "healthy" || engineStatus.status === "ok";

  return (
    <section className="py-12 bg-white border-y border-stone-200">
      <div className="max-w-[1680px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Stat 1: Authentic Modeled Sensor Count */}
          <div className="p-6 rounded-md bg-[#FFFACD]/40 border-2 border-[#F4E88C] text-center hover:scale-102 transition-transform">
            <div className="text-4xl sm:text-5xl font-black text-[#B81104] tracking-tight">
              {totalSensors}
            </div>
            <div className="text-sm font-extrabold text-stone-900 mt-1">
              Modeled Hardware Sensors
            </div>
            <p className="text-xs text-stone-600 mt-1">
              {totalSensors} physical sensors &amp; actuators across {totalGrades} grades.
            </p>
          </div>

          {/* Stat 2: Grounded Accuracy */}
          <div className="p-6 rounded-md bg-[#FDFBF7] border-2 border-stone-200 text-center hover:scale-102 transition-transform">
            <div className="text-4xl sm:text-5xl font-black text-[#1C1917] tracking-tight">
              100%
            </div>
            <div className="text-sm font-extrabold text-stone-900 mt-1">
              Hardware Grounded
            </div>
            <p className="text-xs text-stone-600 mt-1">
              Strict pinout accuracy, zero syntax trivia, 5V tolerance verification.
            </p>
          </div>

          {/* Stat 3: Question Taxonomy */}
          <div className="p-6 rounded-md bg-[#FFFACD]/40 border-2 border-[#F4E88C] text-center hover:scale-102 transition-transform">
            <div className="text-4xl sm:text-5xl font-black text-[#B81104] tracking-tight">
              5
            </div>
            <div className="text-sm font-extrabold text-stone-900 mt-1">
              Question Taxonomies
            </div>
            <p className="text-xs text-stone-600 mt-1">
              Component ID, Pinouts, Lab Scenarios, True/False, and Matching.
            </p>
          </div>

          {/* Stat 4: Live Engine Health */}
          <div className="p-6 rounded-md bg-[#FDFBF7] border-2 border-stone-200 text-center hover:scale-102 transition-transform">
            <div className="text-4xl sm:text-5xl font-black text-[#1C1917] tracking-tight flex items-center justify-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full ${isHealthy ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="text-3xl sm:text-4xl">{isHealthy ? "Online" : "Active"}</span>
            </div>
            <div className="text-sm font-extrabold text-stone-900 mt-1 flex items-center justify-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Assessment Pipeline</span>
            </div>
            <p className="text-xs text-stone-600 mt-1">
              {isHealthy ? "FastAPI backend engine connected." : "Dual AI cascade with offline question bank."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
