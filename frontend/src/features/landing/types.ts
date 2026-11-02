export interface SensorDetail {
  id: string;
  name: string;
  badge: string;
  category: string;
  pins: string[];
  workingPrinciple: string;
  safetyRule: string;
}

export const SENSOR_CATALOG: SensorDetail[] = [
  {
    id: "ultrasonic",
    name: "HC-SR04 Ultrasonic Distance Sensor",
    badge: "Distance & Ranging Module",
    category: "Distance & Ranging",
    pins: ["VCC (5V)", "Trig (Trigger Input)", "Echo (Pulse Output)", "GND (Ground)"],
    workingPrinciple:
      "Emits an ultrasonic wave burst at 40 kHz via the Trig pin and calculates obstacle distance by timing the duration of the return pulse on the Echo pin using the speed of sound.",
    safetyRule:
      "Never supply more than 5.5V to VCC. Echo pin output (5V) requires a voltage divider when connected to 3.3V microcontrollers like ESP32.",
  },
  {
    id: "servo",
    name: "SG90 9g Micro Servo Motor",
    badge: "Actuator & Robotics",
    category: "Mechanical Motion",
    pins: ["Brown (GND)", "Red (VCC 5V)", "Orange (PWM Signal)"],
    workingPrinciple:
      "Uses a closed-loop potentiometer feedback circuit controlled by a 50 Hz PWM (Pulse Width Modulation) signal to rotate precisely between 0° and 180°.",
    safetyRule:
      "Do not power multiple servos directly from the microcontroller 5V onboard pin; stall currents exceed 500mA and can cause the microcontroller to reset or overheat.",
  },
  {
    id: "pir",
    name: "PIR Motion Sensor (HC-SR501)",
    badge: "Infrared Detection",
    category: "Security & Automation",
    pins: ["VCC (5V–12V)", "OUT (3.3V Digital Output)", "GND (Ground)"],
    workingPrinciple:
      "A pyroelectric sensor covered by a segmented Fresnel lens detects subtle changes in ambient infrared radiation emitted by moving warm bodies (humans, pets).",
    safetyRule:
      "Allow 30 to 60 seconds after power-up for the internal sensor element to calibrate against ambient room thermal radiation before reading values.",
  },
  {
    id: "ldr",
    name: "LDR Light Dependent Resistor (Photoresistor)",
    badge: "Analog Light Sensing",
    category: "Environmental Sensing",
    pins: ["Terminal A", "Terminal B (Non-polarized)"],
    workingPrinciple:
      "Photoconductive material decreases in electrical resistance as incident ambient light intensity increases, forming a voltage divider when paired with a 10kΩ fixed resistor.",
    safetyRule:
      "An LDR cannot be connected directly between 5V and an Analog Pin alone; it requires a fixed pull-down resistor (voltage divider) to generate readable voltage changes.",
  },
];
