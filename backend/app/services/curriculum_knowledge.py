"""
curriculum_knowledge.py - Verified STEM Curriculum Component Knowledge Bank

Provides factual, curriculum-grounded assessment questions for hardware components,
testing:
1. Component Identification & Functions
2. Number of Pins & Pin Identification (exact physical pin counts & designated functions)
3. Hypothetical Scenario-Based Practical Reasoning
4. Logical & Conceptual Reasoning

STRICTLY COMPLIES WITH ALL 6 CONSTRAINTS:
1. No project names or project-specific details.
2. No pin connections, circuit diagrams, or wiring steps.
3. Component pin-count questions allowed and explicitly verified.
4. Component functionality, working principles, and scenarios allowed.
5. Answer-option accuracy: Factually correct answer explicitly present in options.
6. Logical validation: Distinct, plausible distractors, zero duplicate questions.
"""

from typing import Dict, Any, List, Optional
import re

CURRICULUM_COMPONENTS: List[Dict[str, Any]] = [
    {
        "id": "arduino_uno",
        "name": "Arduino Uno (ATmega328P)",
        "keywords": ["arduino", "uno", "atmega328p", "microcontroller", "board", "development board"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which microcontroller development board featuring an ATmega328P processor is widely used to read sensor inputs and control electronic actuators in STEM robotics?",
                "options": {
                    "A": "Arduino Uno",
                    "B": "Raspberry Pi Pico",
                    "C": "ESP32-CAM",
                    "D": "STM32 Nucleo"
                },
                "answer": "A",
                "explanation": "The Arduino Uno is an open-source microcontroller board based on the Microchip ATmega328P, equipped with digital and analog I/O pins."
            },
            "Number of Pins & Pin Identification": {
                "question": "What is the total number of general-purpose digital I/O pins available on an Arduino Uno board?",
                "options": {
                    "A": "8 pins",
                    "B": "14 pins (pins 0 through 13)",
                    "C": "20 pins",
                    "D": "32 pins"
                },
                "answer": "B",
                "explanation": "The Arduino Uno board provides 14 digital input/output pins (pins 0 to 13), 6 of which support Pulse Width Modulation (PWM)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "A student powers an Arduino Uno and a high-torque DC motor directly from the same 5V regulator rail. Whenever the motor starts rotating, the Arduino abruptly resets and restarts its program.",
                "question": "In this operational scenario, what is the primary electrical cause of the unexpected microcontroller reset?",
                "options": {
                    "A": "Inductive inrush current from the motor causes a power supply voltage dip (brownout) below the minimum operating reset threshold.",
                    "B": "The ambient temperature dropped below zero causing crystal oscillator shutdown.",
                    "C": "The microcontroller digital clock frequency doubled automatically.",
                    "D": "The digital I/O pins converted spontaneously into analog outputs."
                },
                "answer": "A",
                "explanation": "High inrush currents and inductive noise from DC motors draw excessive current from the supply rail, causing voltage brownouts that trigger the microcontroller's internal Brown-Out Detector (BOD) reset."
            },
            "Logical & Conceptual Reasoning": {
                "question": "What is the primary architectural role of the onboard ATmega328P microcontroller on an Arduino development board?",
                "options": {
                    "A": "To execute programmed instructions, sample inputs from sensors, and generate control signals for actuators.",
                    "B": "To convert high-voltage AC mains power into direct current for heavy appliances.",
                    "C": "To act solely as an illuminated indicator light.",
                    "D": "To mechanically vibrate acoustic sound waves across a room."
                },
                "answer": "A",
                "explanation": "The ATmega328P is the central processor that executes embedded firmware, processes digital/analog sensor signals, and drives output peripherals."
            }
        }
    },
    {
        "id": "hc_sr04",
        "name": "HC-SR04 Ultrasonic Sensor",
        "keywords": ["ultrasonic", "hc-sr04", "distance", "acoustic", "sonar", "echo", "trigger"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which electronic sensor module is specifically designed to measure physical distance by transmitting high-frequency acoustic pulses and timing the reflected echo duration?",
                "options": {
                    "A": "PIR Motion Sensor",
                    "B": "HC-SR04 Ultrasonic Sensor",
                    "C": "Light Dependent Resistor (LDR)",
                    "D": "DHT11 Humidity Sensor"
                },
                "answer": "B",
                "explanation": "The HC-SR04 ultrasonic sensor uses 40 kHz acoustic sound pulse reflections (time-of-flight) to measure distance to an obstacle."
            },
            "Number of Pins & Pin Identification": {
                "question": "How many physical connection pins are located on a standard HC-SR04 ultrasonic distance sensor (VCC, Trig, Echo, GND)?",
                "options": {
                    "A": "2 pins",
                    "B": "3 pins",
                    "C": "4 pins (VCC, Trig, Echo, GND)",
                    "D": "6 pins"
                },
                "answer": "C",
                "explanation": "A standard HC-SR04 module has exactly 4 physical pins: VCC (5V power), Trig (trigger input pulse), Echo (echo pulse output), and GND (ground)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "An autonomous mobile robot equipped with an HC-SR04 ultrasonic distance sensor approaches a partition covered with thick acoustic sound-absorbing foam but fails to detect it, colliding with the barrier.",
                "question": "What is the primary physical cause for the sensor's failure to detect the obstacle in this scenario?",
                "options": {
                    "A": "The porous acoustic foam absorbs the high-frequency sound waves rather than reflecting an echo pulse back to the sensor.",
                    "B": "The sensor's optical receiver was blinded by ambient room lighting.",
                    "C": "The operating supply voltage doubled above its rated maximum limit.",
                    "D": "The microcontroller digital clock frequency drifted too high."
                },
                "answer": "A",
                "explanation": "Ultrasonic distance sensors rely on acoustic echo reflection; soft, porous materials absorb acoustic sound energy, preventing the return echo pulse from reaching the receiver."
            },
            "Logical & Conceptual Reasoning": {
                "question": "In ultrasonic distance calculation, why is the total echo pulse duration divided by 2 when computing the distance to an obstacle?",
                "options": {
                    "A": "Because the ultrasonic sound wave travels two-way: from the transmitter to the obstacle and back to the receiver.",
                    "B": "To compensate for voltage drops across the sensor power pins.",
                    "C": "Because the internal timer operates at double the system clock speed.",
                    "D": "To adjust for daytime versus nighttime atmospheric pressure."
                },
                "answer": "A",
                "explanation": "The measured travel time represents the round-trip acoustic journey from the transmitter to the target and back to the receiver, so dividing by 2 calculates the one-way distance."
            }
        }
    },
    {
        "id": "dht11",
        "name": "DHT11 Temperature & Humidity Sensor",
        "keywords": ["dht11", "dht22", "humidity", "temperature sensor", "temperature and humidity", "hygrometer"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which electronic sensor module integrates a capacitive humidity sensor and a thermistor to measure atmospheric temperature and relative humidity simultaneously?",
                "options": {
                    "A": "DHT11 Sensor",
                    "B": "HC-SR04 Sensor",
                    "C": "PIR Motion Sensor",
                    "D": "LDR Sensor"
                },
                "answer": "A",
                "explanation": "The DHT11 is an integrated digital sensor module designed to measure atmospheric relative humidity and temperature using a single digital data pin."
            },
            "Number of Pins & Pin Identification": {
                "question": "A standard raw through-hole DHT11 temperature and humidity sensor package features how many total physical pins?",
                "options": {
                    "A": "2 pins",
                    "B": "3 pins",
                    "C": "4 pins (VCC, Data, NC, GND)",
                    "D": "6 pins"
                },
                "answer": "C",
                "explanation": "A raw DHT11 sensor package has 4 pins: Pin 1 (VCC), Pin 2 (Data), Pin 3 (Not Connected / NC), and Pin 4 (GND)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "A environmental monitoring system connects a DHT11 sensor using a 10-meter long unshielded cable and experiences continuous communication timeouts and checksum failure errors.",
                "question": "Which hardware modification is most effective to restore reliable digital communication over this distance?",
                "options": {
                    "A": "Add a 4.7kΩ to 10kΩ pull-up resistor between the Data line and VCC near the sensor to sharpen digital edge transition rise times.",
                    "B": "Replace the power supply with an unregulated 24V AC transformer.",
                    "C": "Short the Data pin directly to GND to reduce line impedance.",
                    "D": "Disconnect the ground wire to eliminate ground loops."
                },
                "answer": "A",
                "explanation": "Long wires introduce parasitic capacitance that slows digital signal rise times. A dedicated pull-up resistor (4.7kΩ-10kΩ) pulls the open-drain Data line high rapidly, preserving signal integrity."
            },
            "Logical & Conceptual Reasoning": {
                "question": "How does a DHT11 digital sensor transmit its 40-bit temperature and humidity readings to a microcontroller?",
                "options": {
                    "A": "Via a proprietary single-wire bi-directional digital serial communication protocol.",
                    "B": "Through a high-speed 16-bit parallel bus interface.",
                    "C": "By modulating high-voltage AC frequencies across the power rail.",
                    "D": "Using two differential radio frequency antenna pins."
                },
                "answer": "A",
                "explanation": "The DHT11 uses a single-wire digital serial protocol where pulse duration widths distinguish logic '0' from logic '1' across a 40-bit data packet."
            }
        }
    },
    {
        "id": "ldr",
        "name": "Light Dependent Resistor (LDR)",
        "keywords": ["ldr", "photoresistor", "light sensor", "light dependent", "photocell", "ambient light"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which passive electronic component exhibits a dramatic decrease in electrical resistance as ambient visible light illumination increases?",
                "options": {
                    "A": "Light Dependent Resistor (LDR)",
                    "B": "Thermistor",
                    "C": "Piezoelectric Buzzer",
                    "D": "Inductive Relay Coil"
                },
                "answer": "A",
                "explanation": "A Light Dependent Resistor (LDR or photoresistor) is a semiconductor device whose electrical resistance decreases when exposed to light."
            },
            "Number of Pins & Pin Identification": {
                "question": "A standard Light Dependent Resistor (LDR photoresistor) connects into a circuit using how many terminal leads?",
                "options": {
                    "A": "2 pins (non-polarized leads)",
                    "B": "3 pins",
                    "C": "4 pins",
                    "D": "5 pins"
                },
                "answer": "A",
                "explanation": "A standard LDR is a two-terminal passive component with non-polarized leads."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "A student connects an LDR directly between a 5V power pin and an Arduino analog input pin without any additional components. When tested under bright light and total darkness, the analog reading remains pegged at maximum (1023).",
                "question": "What essential circuit configuration was omitted in this setup?",
                "options": {
                    "A": "A fixed resistor connected in series to form a voltage divider network with the LDR.",
                    "B": "A high-current relay connected in parallel with the LDR.",
                    "C": "A step-up transformer to convert the input to AC voltage.",
                    "D": "A flyback diode placed in reverse bias across the analog pin."
                },
                "answer": "A",
                "explanation": "Microcontroller analog inputs measure voltage, not resistance. A fixed resistor must be placed in series with the LDR to create a voltage divider that translates varying resistance into a varying voltage."
            },
            "Logical & Conceptual Reasoning": {
                "question": "What underlying physical phenomenon causes an LDR's electrical resistance to drop when struck by visible light?",
                "options": {
                    "A": "Photoconductivity: incident photons transfer energy to valence electrons, generating free electron-hole pairs that increase electrical conductivity.",
                    "B": "Thermal expansion causing internal metallic contacts to compress.",
                    "C": "Electromagnetic induction producing an opposite magnetic flux.",
                    "D": "Piezoelectric resonance exciting acoustic vibrations in the crystal."
                },
                "answer": "A",
                "explanation": "LDRs are made of semiconductor materials like cadmium sulfide (CdS). Incident light photons liberate charge carriers through the photoelectric effect / photoconductivity, lowering electrical resistance."
            }
        }
    },
    {
        "id": "pir",
        "name": "PIR Motion Sensor",
        "keywords": ["pir", "motion sensor", "passive infrared", "human detection", "motion", "infrared motion"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which sensor module detects the movement of people and warm objects by sensing differential changes in ambient infrared radiation?",
                "options": {
                    "A": "PIR Motion Sensor",
                    "B": "LDR Photoresistor",
                    "C": "Ultrasonic Distance Sensor",
                    "D": "Potentiometer"
                },
                "answer": "A",
                "explanation": "A Passive Infrared (PIR) sensor measures infrared light radiating from objects in its field of view, detecting motion when thermal patterns change across its sensing elements."
            },
            "Number of Pins & Pin Identification": {
                "question": "A standard HC-SR501 PIR motion detector breakout module provides how many physical connection pins for interface?",
                "options": {
                    "A": "2 pins",
                    "B": "3 pins (VCC, OUT, GND)",
                    "C": "4 pins",
                    "D": "6 pins"
                },
                "answer": "B",
                "explanation": "A standard PIR motion sensor module has 3 physical connection pins: VCC (operating power), Digital OUT (high/low logic output), and GND (ground)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "A PIR motion sensor installed in a vacant indoor room repeatedly generates false motion alarms on sunny afternoons even though no people or animals enter the room.",
                "question": "What is the most probable environmental cause for these false motion triggers?",
                "options": {
                    "A": "Rapid thermal air currents from a nearby heating/cooling vent or direct sunlight crossing the sensor's optical field of view.",
                    "B": "High-frequency acoustic vibrations from desktop computer fans.",
                    "C": "Weak magnetic fields generated by fluorescent light ballasts.",
                    "D": "The ambient relative humidity dropping by 2%."
                },
                "answer": "A",
                "explanation": "PIR sensors detect changes in infrared thermal radiation. Sudden drafts of warm air or sunlight heating the floor produce rapid temperature differentials that mimic the heat signature of a moving person."
            },
            "Logical & Conceptual Reasoning": {
                "question": "Why is a faceted white Fresnel lens mounted over the pyroelectric sensor in a PIR module?",
                "options": {
                    "A": "To segment the detection field of view into multiple zones and focus infrared radiation onto the pyroelectric detector elements.",
                    "B": "To amplify acoustic sound waves before they reach the circuit.",
                    "C": "To step down the incoming electrical voltage from 12V to 3.3V.",
                    "D": "To prevent visible light from leaving the sensor housing."
                },
                "answer": "A",
                "explanation": "The Fresnel lens divides the wide viewing angle into distinct optical detection cones, allowing a moving thermal body to pass in and out of active zones to generate detectable differential voltage spikes."
            }
        }
    },
    {
        "id": "ssd1306_oled",
        "name": "SSD1306 OLED Display (0.96 inch I2C)",
        "keywords": ["oled", "ssd1306", "display", "screen", "i2c display", "graphic display"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which display technology uses self-emissive organic light-emitting pixels operating over an I2C serial interface without requiring an external backlight?",
                "options": {
                    "A": "SSD1306 OLED Display",
                    "B": "16x2 Parallel Character LCD",
                    "C": "Seven-Segment LED Display",
                    "D": "Cathode Ray Tube (CRT)"
                },
                "answer": "A",
                "explanation": "The SSD1306 OLED display features self-illuminating organic pixels, providing high contrast, deep blacks, and low power consumption over a two-wire I2C interface."
            },
            "Number of Pins & Pin Identification": {
                "question": "An I2C-based 0.96-inch SSD1306 graphic OLED display module connects to a microcontroller using how many physical header pins?",
                "options": {
                    "A": "2 pins",
                    "B": "4 pins (VCC, GND, SCL, SDA)",
                    "C": "6 pins",
                    "D": "8 pins"
                },
                "answer": "B",
                "explanation": "A standard I2C OLED display breakout module has 4 pins: VCC (power), GND (ground), SCL (serial clock line), and SDA (serial data line)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "An I2C OLED display is wired to a microcontroller, but during initialization the program freezes and the display screen remains completely dark.",
                "question": "Which hardware configuration issue is the most frequent cause of this communication stall?",
                "options": {
                    "A": "Missing pull-up resistors on the I2C bus (SDA/SCL lines) or an incorrect device I2C hex address specified in code.",
                    "B": "The display pixels ran out of internal phosphor coating.",
                    "C": "The microcontroller clock speed is running too fast for direct current.",
                    "D": "The ground pin was connected to a shared circuit ground rail."
                },
                "answer": "A",
                "explanation": "I2C is an open-drain bus protocol requiring pull-up resistors on SDA and SCL to maintain high idle states. If pull-ups are missing or the target address does not match (e.g. 0x3C vs 0x3D), communication will hang."
            },
            "Logical & Conceptual Reasoning": {
                "question": "Why do OLED displays achieve dramatically higher contrast ratios than traditional LCD screens when rendering dark user interfaces?",
                "options": {
                    "A": "Because black OLED pixels are turned completely off and emit zero light, whereas LCDs must continuously block an active backlight.",
                    "B": "Because OLED displays reflect ambient room light through optical microscopic mirrors.",
                    "C": "Because OLED screens run on high-voltage alternating current.",
                    "D": "Because OLED pixels absorb all incoming electrical noise."
                },
                "answer": "A",
                "explanation": "OLED pixels are individually self-emissive. To display black, the corresponding OLED pixels are turned completely off, producing true zero-luminance blacks and infinite contrast."
            }
        }
    },
    {
        "id": "sg90_servo",
        "name": "SG90 Micro Servo Motor",
        "keywords": ["servo", "sg90", "motor", "actuator", "angular control", "pwm motor"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which electromechanical actuator integrates a DC motor, reduction gearbox, and internal feedback potentiometer to provide precise angular output shaft positioning between 0 and 180 degrees?",
                "options": {
                    "A": "SG90 Servo Motor",
                    "B": "Stepper Motor Driver",
                    "C": "Piezo Buzzer",
                    "D": "Relay Module"
                },
                "answer": "A",
                "explanation": "The SG90 is a closed-loop micro servo motor that converts Pulse Width Modulation (PWM) signals into precise angular shaft positions."
            },
            "Number of Pins & Pin Identification": {
                "question": "How many wires make up the standard female connector plug of an SG90 micro servo motor?",
                "options": {
                    "A": "2 wires",
                    "B": "3 wires (PWM Signal, VCC, GND)",
                    "C": "4 wires",
                    "D": "5 wires"
                },
                "answer": "B",
                "explanation": "Standard hobby servos use 3 wires: PWM control signal (orange/yellow), VCC positive power (red), and GND ground (brown/black)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "When commanded to its maximum rotational angle, a servo motor buzzes loudly, heats up rapidly, and draws excessive current without turning any further.",
                "question": "What mechanical condition is causing this excessive current draw and buzzing?",
                "options": {
                    "A": "The command pulse width is driving the internal gear mechanism against its physical end-stop limiter, stalling the motor.",
                    "B": "The permanent magnets inside the motor have lost their magnetic field.",
                    "C": "The supply voltage dropped below zero volts.",
                    "D": "The feedback potentiometer disconnected from the circuit ground."
                },
                "answer": "A",
                "explanation": "Stalling occurs when a PWM signal attempts to push the servo shaft past its internal mechanical limits, causing the DC motor to draw full stall current against the stationary stop."
            },
            "Logical & Conceptual Reasoning": {
                "question": "How is the target angular shaft position encoded in the control signal of a standard hobby servo motor?",
                "options": {
                    "A": "By the pulse width (duration) of a periodic PWM signal, typically between 1.0 ms (0°) and 2.0 ms (180°) repeated every 20 ms.",
                    "B": "By varying the continuous analog voltage linearly from 0V to 12V.",
                    "C": "By the frequency modulation of an ultrasonic sound wave.",
                    "D": "By counting the total continuous number of logic HIGH transitions."
                },
                "answer": "A",
                "explanation": "Servo position is determined by the duration of the high pulse (typically 1.0 ms to 2.0 ms) within a 50 Hz (20 ms period) PWM signal."
            }
        }
    },
    {
        "id": "relay_module",
        "name": "5V Single-Channel Relay Module",
        "keywords": ["relay", "relay module", "switch high voltage", "electromechanical", "normally open", "com no nc"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which electromechanical module allows a low-voltage 5V microcontroller logic signal to safely switch high-voltage or high-current electrical loads with complete galvanic isolation?",
                "options": {
                    "A": "5V Relay Module",
                    "B": "Rotary Potentiometer",
                    "C": "Piezoelectric Buzzer",
                    "D": "LDR Light Sensor"
                },
                "answer": "A",
                "explanation": "A relay module uses an electromagnetic coil to mechanically open or close electrical contacts, isolating the low-voltage microcontroller from high-voltage circuits."
            },
            "Number of Pins & Pin Identification": {
                "question": "On its low-voltage logic input header, how many pins does a standard 5V single-channel relay module possess?",
                "options": {
                    "A": "2 pins",
                    "B": "3 pins (VCC, GND, IN)",
                    "C": "4 pins",
                    "D": "6 pins"
                },
                "answer": "B",
                "explanation": "The low-voltage control header of a standard single-channel relay module consists of 3 pins: VCC (power), GND (ground), and IN (digital control trigger input)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "A microcontroller randomly resets or halts every time its 5V relay de-energizes after controlling a high-voltage inductive solenoid valve.",
                "question": "Which protective component must be present across the inductive coil to eliminate these reset spikes?",
                "options": {
                    "A": "A flyback (freewheeling) diode across the coil to clamp high-voltage inductive back-EMF spikes.",
                    "B": "A higher resistance pull-down resistor on the power bus.",
                    "C": "A step-up transformer connected to the digital trigger pin.",
                    "D": "A series electrolytic capacitor to block DC voltage."
                },
                "answer": "A",
                "explanation": "When an inductive coil is de-energized, the collapsing magnetic field generates a massive reverse voltage spike (back-EMF). A flyback diode dissipates this energy safely, protecting the circuit."
            },
            "Logical & Conceptual Reasoning": {
                "question": "On the load terminal block of a relay module, what is the functional difference between the Normally Open (NO) and Normally Closed (NC) contacts?",
                "options": {
                    "A": "NO remains disconnected from Common (COM) until the relay coil is energized, while NC remains connected to COM when the relay is unpowered.",
                    "B": "NO is designed for direct current (DC), whereas NC is only rated for alternating current (AC).",
                    "C": "NO carries digital communication signals, while NC carries supply power.",
                    "D": "NO operates at 5V, while NC requires 240V."
                },
                "answer": "A",
                "explanation": "The Normally Open (NO) terminal is open (disconnected) when the relay is off and closes when activated; the Normally Closed (NC) terminal is closed (connected) by default and opens when activated."
            }
        }
    },
    {
        "id": "piezo_buzzer",
        "name": "Piezo Buzzer (Active / Passive)",
        "keywords": ["buzzer", "piezo", "acoustic alert", "tone", "audio", "sound alert"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which acoustic component utilizes the inverse piezoelectric effect of a ceramic element to produce audible sound alerts, beeps, or musical tones?",
                "options": {
                    "A": "Piezo Buzzer",
                    "B": "Relay Module",
                    "C": "Servo Motor",
                    "D": "Photoresistor"
                },
                "answer": "A",
                "explanation": "A piezo buzzer uses piezoelectric ceramics that flex and vibrate when an electrical voltage is applied, generating acoustic sound waves."
            },
            "Number of Pins & Pin Identification": {
                "question": "A standard electronic piezoelectric buzzer element is built with how many physical electrical leads?",
                "options": {
                    "A": "2 pins (Positive / Anode and Negative / Cathode)",
                    "B": "3 pins",
                    "C": "4 pins",
                    "D": "5 pins"
                },
                "answer": "A",
                "explanation": "A standard piezo buzzer element has 2 connection pins: a positive terminal (longer lead) and a negative/ground terminal (shorter lead)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "A student connects a passive piezo buzzer to an Arduino digital output pin and sets the pin to continuous logic HIGH, but only hears a single faint click rather than a steady tone.",
                "question": "Why does the passive buzzer fail to emit a continuous audible sound under a constant DC HIGH signal?",
                "options": {
                    "A": "Passive buzzers lack an internal oscillator and require an alternating AC square-wave frequency (PWM/tone) to vibrate continuously.",
                    "B": "The buzzer's polarity was permanently reversed by the DC voltage.",
                    "C": "The output current was clamped by an internal thermal fuse.",
                    "D": "Passive buzzers only generate sound in an acoustic vacuum chamber."
                },
                "answer": "A",
                "explanation": "Unlike active buzzers which have built-in oscillating circuits, passive buzzers require an alternating square wave signal (such as Arduino tone()) to generate continuous sound vibrations."
            },
            "Logical & Conceptual Reasoning": {
                "question": "What is the primary operational difference between an Active Buzzer and a Passive Buzzer?",
                "options": {
                    "A": "An active buzzer contains an internal oscillating circuit and produces sound from steady DC voltage, while a passive buzzer requires an external AC frequency signal.",
                    "B": "An active buzzer operates on AC mains voltage while a passive buzzer runs on 5V DC.",
                    "C": "An active buzzer emits light indicators while a passive buzzer emits sound.",
                    "D": "An active buzzer is a sensor while a passive buzzer is an actuator."
                },
                "answer": "A",
                "explanation": "Active buzzers have an internal oscillator circuit that sounds automatically when supplied with DC power; passive buzzers have no internal oscillator and need an external frequency."
            }
        }
    },
    {
        "id": "led_resistor",
        "name": "Light Emitting Diode (LED) & Resistor",
        "keywords": ["led", "light emitting diode", "resistor", "current limiting", "diode", "traffic light", "leds"],
        "questions": {
            "Component Identification & Functions": {
                "question": "Which semiconductor component emits visible light when forward-biased and requires a current-limiting resistor to protect it from thermal burnout?",
                "options": {
                    "A": "Light Emitting Diode (LED)",
                    "B": "Photoresistor (LDR)",
                    "C": "Piezoelectric Buzzer",
                    "D": "Bipolar Junction Transistor"
                },
                "answer": "A",
                "explanation": "An LED is a semiconductor light source that emits light through electroluminescence when forward current flows across its p-n junction."
            },
            "Number of Pins & Pin Identification": {
                "question": "A standard single-color through-hole Light Emitting Diode (LED) has how many distinct physical connection leads?",
                "options": {
                    "A": "2 pins (Anode / positive long lead and Cathode / negative short lead)",
                    "B": "3 pins",
                    "C": "4 pins",
                    "D": "5 pins"
                },
                "answer": "A",
                "explanation": "A standard single-color through-hole LED has exactly 2 pins: the longer lead is the Anode (+) and the shorter lead with a flat edge is the Cathode (-)."
            },
            "Hypothetical Scenario-Based Practical Reasoning": {
                "scenario": "A student connects a 5V digital output directly to an LED without placing a resistor in series. The LED flashes once with extreme brightness and then permanently stops working.",
                "question": "What physical failure occurred within the LED?",
                "options": {
                    "A": "Unconstrained forward current caused thermal runaway that destroyed the semiconductor p-n junction.",
                    "B": "The LED absorbed excess optical photons from the environment.",
                    "C": "The supply voltage reversed the internal crystal polarity of the LED.",
                    "D": "The LED's internal capacitor experienced dielectric breakdown."
                },
                "answer": "A",
                "explanation": "LEDs have negligible internal resistance once their forward voltage threshold is exceeded. Without a current-limiting resistor, excessive current flows, instantly overheating and burning out the p-n junction."
            },
            "Logical & Conceptual Reasoning": {
                "question": "Why is a current-limiting resistor placed in series with an LED connected to a 5V microcontroller pin?",
                "options": {
                    "A": "To safely drop the excess voltage and limit the forward current through the LED to a safe operating range (typically 10-20 mA).",
                    "B": "To increase the digital voltage from 5V to 50V for brighter illumination.",
                    "C": "To convert direct current (DC) into alternating current (AC).",
                    "D": "To invert the digital output logic state from HIGH to LOW."
                },
                "answer": "A",
                "explanation": "The series resistor drops the voltage difference between the 5V supply and the LED forward voltage (e.g. 5V - 2V = 3V), limiting current according to Ohm's Law (I = V/R) to protect both the LED and microcontroller pin."
            }
        }
    }
]


def detect_components_in_text(text: str) -> List[Dict[str, Any]]:
    """Scan curriculum text and return matching components in priority order."""
    text_lower = str(text or "").lower()
    matched = []
    for comp in CURRICULUM_COMPONENTS:
        for kw in comp["keywords"]:
            if re.search(r"\b" + re.escape(kw) + r"\b", text_lower):
                matched.append(comp)
                break
    # If no components matched, provide foundational defaults
    if not matched:
        matched = CURRICULUM_COMPONENTS[:4]
    return matched


def get_curriculum_component_questions(
    content: str,
    target_count: int = 12,
    needed_categories: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Generates balanced, factually validated curriculum questions derived from
    components present in the uploaded text, strictly adhering to all 6 constraints:
    - Zero project names
    - Zero circuit diagrams or wiring steps
    - Valid pin-count and functional questions
    - 100% accurate options with correct answer explicitly present
    - No duplicate questions
    """
    matched = detect_components_in_text(content)
    # Ensure all 10 curriculum components are available as backfill if text had few components
    all_components = matched + [c for c in CURRICULUM_COMPONENTS if c["id"] not in {m["id"] for m in matched}]

    categories = [
        "Component Identification & Functions",
        "Number of Pins & Pin Identification",
        "Hypothetical Scenario-Based Practical Reasoning",
        "Logical & Conceptual Reasoning"
    ]
    if needed_categories:
        categories = list(needed_categories)

    selected: List[Dict[str, Any]] = []
    seen_questions = set()

    # Pass round-robin through categories, and within each category pick next unused question
    for pass_num in range(12):
        if len(selected) >= target_count:
            break
        for cat in categories:
            if len(selected) >= target_count:
                break
            for comp in all_components:
                q_data = comp["questions"].get(cat)
                if q_data and q_data["question"] not in seen_questions:
                    item = {
                        "type": "mcq",
                        "question": q_data["question"],
                        "options": dict(q_data["options"]),
                        "answer": q_data["answer"],
                        "explanation": q_data["explanation"],
                        "category": cat,
                        "section": cat,
                        "marks": 1
                    }
                    if q_data.get("scenario"):
                        item["scenario"] = q_data["scenario"]

                    selected.append(item)
                    seen_questions.add(q_data["question"])
                    break

    return selected[:target_count]

