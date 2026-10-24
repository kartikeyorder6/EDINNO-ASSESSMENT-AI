"""
curriculum_knowledge.py - Verified STEM curriculum component knowledge bank.

Provides factual, curriculum-grounded assessment questions for hardware components,
covering:
1. Component Identification & Functions
2. Number of Pins & Pin Identification (physical pin counts only)
3. Hypothetical Scenario-Based Practical Reasoning
4. Logical & Conceptual Reasoning
5. True / False Conceptual Diagnostics

Constraints honoured by every entry:
- no project names or project-specific details
- no pin connections, circuit diagrams or wiring steps
- component pin-count and functionality questions only
- the correct answer is always present among distinct, plausible options
- no duplicate questions
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Set

# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

CAT_COMPONENT = "Component Identification & Functions"
CAT_PINS = "Number of Pins & Pin Identification"
CAT_SCENARIO = "Hypothetical Scenario-Based Practical Reasoning"
CAT_LOGIC = "Logical & Conceptual Reasoning"
CAT_TF = "True / False Conceptual"

CORE_CATEGORIES: List[str] = [CAT_COMPONENT, CAT_PINS, CAT_SCENARIO, CAT_LOGIC]
STANDARD_MIXED_CATEGORIES: List[str] = [CAT_COMPONENT, CAT_PINS, CAT_LOGIC]

# ---------------------------------------------------------------------------
# Entry builders
# ---------------------------------------------------------------------------

def _mcq(
    question: str,
    options: Sequence[str],
    answer: str,
    explanation: str,
    scenario: Optional[str] = None,
) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "question": question,
        "options": dict(zip("ABCD", options)),
        "answer": answer,
        "explanation": explanation,
    }
    if scenario:
        entry["scenario"] = scenario
    return entry


def _tf(question: str, answer: str, explanation: str) -> Dict[str, Any]:
    return {
        "question": question,
        "options": {"A": "True", "B": "False"},
        "answer": answer,
        "explanation": explanation,
    }


def _component(
    comp_id: str,
    name: str,
    keywords: Sequence[str],
    component: Dict[str, Any],
    pins: Dict[str, Any],
    scenario: Dict[str, Any],
    logic: Dict[str, Any],
    true_false: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "id": comp_id,
        "name": name,
        "keywords": list(keywords),
        "questions": {
            CAT_COMPONENT: component,
            CAT_PINS: pins,
            CAT_SCENARIO: scenario,
            CAT_LOGIC: logic,
            CAT_TF: true_false,
        },
    }


# ---------------------------------------------------------------------------
# Knowledge bank
# ---------------------------------------------------------------------------

CURRICULUM_COMPONENTS: List[Dict[str, Any]] = [
    _component(
        "arduino_uno", "Arduino Uno (ATmega328P)",
        ["arduino", "uno", "atmega328p", "microcontroller", "board", "development board"],
        _mcq(
            "Which microcontroller development board featuring an ATmega328P processor is widely used to read sensor inputs and control electronic actuators in STEM robotics?",
            ["Arduino Uno", "Raspberry Pi Pico", "ESP32-CAM", "STM32 Nucleo"], "A",
            "The Arduino Uno is an open-source microcontroller board based on the Microchip ATmega328P, equipped with digital and analog I/O pins.",
        ),
        _mcq(
            "What is the total number of general-purpose digital I/O pins available on an Arduino Uno board?",
            ["8 pins", "14 pins (pins 0 through 13)", "20 pins", "32 pins"], "B",
            "The Arduino Uno board provides 14 digital input/output pins (pins 0 to 13), 6 of which support Pulse Width Modulation (PWM).",
        ),
        _mcq(
            "In this operational scenario, what is the primary electrical cause of the unexpected microcontroller reset?",
            [
                "Inductive inrush current from the motor causes a power supply voltage dip (brownout) below the minimum operating reset threshold.",
                "The ambient temperature dropped below zero causing crystal oscillator shutdown.",
                "The microcontroller digital clock frequency doubled automatically.",
                "The digital I/O pins converted spontaneously into analog outputs.",
            ], "A",
            "High inrush currents and inductive noise from DC motors draw excessive current from the supply rail, causing voltage brownouts that trigger the microcontroller's internal Brown-Out Detector (BOD) reset.",
            scenario="A student powers an Arduino Uno and a high-torque DC motor directly from the same 5V regulator rail. Whenever the motor starts rotating, the Arduino abruptly resets and restarts its program.",
        ),
        _mcq(
            "What is the primary architectural role of the onboard ATmega328P microcontroller on an Arduino development board?",
            [
                "To execute programmed instructions, sample inputs from sensors, and generate control signals for actuators.",
                "To convert high-voltage AC mains power into direct current for heavy appliances.",
                "To act solely as an illuminated indicator light.",
                "To mechanically vibrate acoustic sound waves across a room.",
            ], "A",
            "The ATmega328P is the central processor that executes embedded firmware, processes digital/analog sensor signals, and drives output peripherals.",
        ),
        _tf(
            "The Arduino Uno provides 6 Pulse Width Modulation (PWM) outputs among its 14 digital I/O pins.", "A",
            "Digital pins 3, 5, 6, 9, 10, and 11 on the Arduino Uno support 8-bit hardware PWM output.",
        ),
    ),
    _component(
        "hc_sr04", "HC-SR04 Ultrasonic Sensor",
        ["ultrasonic", "hc-sr04", "distance", "acoustic", "sonar", "echo", "trigger"],
        _mcq(
            "Which electronic sensor module is specifically designed to measure physical distance by transmitting high-frequency acoustic pulses and timing the reflected echo duration?",
            ["PIR Motion Sensor", "HC-SR04 Ultrasonic Sensor", "Light Dependent Resistor (LDR)", "DHT11 Humidity Sensor"], "B",
            "The HC-SR04 ultrasonic sensor uses 40 kHz acoustic sound pulse reflections (time-of-flight) to measure distance to an obstacle.",
        ),
        _mcq(
            "How many physical connection pins are located on a standard HC-SR04 ultrasonic distance sensor (VCC, Trig, Echo, GND)?",
            ["2 pins", "3 pins", "4 pins (VCC, Trig, Echo, GND)", "6 pins"], "C",
            "A standard HC-SR04 module has exactly 4 physical pins: VCC (5V power), Trig (trigger input pulse), Echo (echo pulse output), and GND (ground).",
        ),
        _mcq(
            "What is the primary physical cause for the sensor's failure to detect the obstacle in this scenario?",
            [
                "The porous acoustic foam absorbs the high-frequency sound waves rather than reflecting an echo pulse back to the sensor.",
                "The sensor's optical receiver was blinded by ambient room lighting.",
                "The operating supply voltage doubled above its rated maximum limit.",
                "The microcontroller digital clock frequency drifted too high.",
            ], "A",
            "Ultrasonic distance sensors rely on acoustic echo reflection; soft, porous materials absorb acoustic sound energy, preventing the return echo pulse from reaching the receiver.",
            scenario="An autonomous mobile robot equipped with an HC-SR04 ultrasonic distance sensor approaches a partition covered with thick acoustic sound-absorbing foam but fails to detect it, colliding with the barrier.",
        ),
        _mcq(
            "In ultrasonic distance calculation, why is the total echo pulse duration divided by 2 when computing the distance to an obstacle?",
            [
                "Because the ultrasonic sound wave travels two-way: from the transmitter to the obstacle and back to the receiver.",
                "To compensate for voltage drops across the sensor power pins.",
                "Because the internal timer operates at double the system clock speed.",
                "To adjust for daytime versus nighttime atmospheric pressure.",
            ], "A",
            "The measured travel time represents the round-trip acoustic journey from the transmitter to the target and back to the receiver, so dividing by 2 calculates the one-way distance.",
        ),
        _tf(
            "An HC-SR04 ultrasonic distance sensor measures obstacle distance using reflected optical infrared light beams.", "B",
            "The HC-SR04 operates using 40 kHz high-frequency ultrasonic acoustic sound waves (echo pulses), not optical light.",
        ),
    ),
    _component(
        "dht11", "DHT11 Temperature & Humidity Sensor",
        ["dht11", "dht22", "humidity", "temperature sensor", "temperature and humidity", "hygrometer"],
        _mcq(
            "Which electronic sensor module integrates a capacitive humidity sensor and a thermistor to measure atmospheric temperature and relative humidity simultaneously?",
            ["DHT11 Sensor", "HC-SR04 Sensor", "PIR Motion Sensor", "LDR Sensor"], "A",
            "The DHT11 is an integrated digital sensor module designed to measure atmospheric relative humidity and temperature using a single digital data pin.",
        ),
        _mcq(
            "A standard raw through-hole DHT11 temperature and humidity sensor package features how many total physical pins?",
            ["2 pins", "3 pins", "4 pins (VCC, Data, NC, GND)", "6 pins"], "C",
            "A raw DHT11 sensor package has 4 pins: Pin 1 (VCC), Pin 2 (Data), Pin 3 (Not Connected / NC), and Pin 4 (GND).",
        ),
        _mcq(
            "Which hardware modification is most effective to restore reliable digital communication over this distance?",
            [
                "Add a 4.7kΩ to 10kΩ pull-up resistor between the Data line and VCC near the sensor to sharpen digital edge transition rise times.",
                "Replace the power supply with an unregulated 24V AC transformer.",
                "Short the Data pin directly to GND to reduce line impedance.",
                "Disconnect the ground wire to eliminate ground loops.",
            ], "A",
            "Long wires introduce parasitic capacitance that slows digital signal rise times. A dedicated pull-up resistor (4.7kΩ-10kΩ) pulls the open-drain Data line high rapidly, preserving signal integrity.",
            scenario="A environmental monitoring system connects a DHT11 sensor using a 10-meter long unshielded cable and experiences continuous communication timeouts and checksum failure errors.",
        ),
        _mcq(
            "How does a DHT11 digital sensor transmit its 40-bit temperature and humidity readings to a microcontroller?",
            [
                "Via a proprietary single-wire bi-directional digital serial communication protocol.",
                "Through a high-speed 16-bit parallel bus interface.",
                "By modulating high-voltage AC frequencies across the power rail.",
                "Using two differential radio frequency antenna pins.",
            ], "A",
            "The DHT11 uses a single-wire digital serial protocol where pulse duration widths distinguish logic '0' from logic '1' across a 40-bit data packet.",
        ),
        _tf(
            "A standard raw through-hole DHT11 temperature and humidity sensor package features 4 physical pins, where pin 3 is typically Not Connected (NC).", "A",
            "The 4 pins of a raw DHT11 are 1: VCC, 2: DATA, 3: NC (Not Connected), and 4: GND.",
        ),
    ),
    _component(
        "ldr", "Light Dependent Resistor (LDR)",
        ["ldr", "photoresistor", "light sensor", "light dependent", "photocell", "ambient light"],
        _mcq(
            "Which passive electronic component exhibits a dramatic decrease in electrical resistance as ambient visible light illumination increases?",
            ["Light Dependent Resistor (LDR)", "Thermistor", "Piezoelectric Buzzer", "Inductive Relay Coil"], "A",
            "A Light Dependent Resistor (LDR or photoresistor) is a semiconductor device whose electrical resistance decreases when exposed to light.",
        ),
        _mcq(
            "A standard Light Dependent Resistor (LDR photoresistor) connects into a circuit using how many terminal leads?",
            ["2 pins (non-polarized leads)", "3 pins", "4 pins", "5 pins"], "A",
            "A standard LDR is a two-terminal passive component with non-polarized leads.",
        ),
        _mcq(
            "What essential circuit configuration was omitted in this setup?",
            [
                "A fixed resistor connected in series to form a voltage divider network with the LDR.",
                "A high-current relay connected in parallel with the LDR.",
                "A step-up transformer to convert the input to AC voltage.",
                "A flyback diode placed in reverse bias across the analog pin.",
            ], "A",
            "Microcontroller analog inputs measure voltage, not resistance. A fixed resistor must be placed in series with the LDR to create a voltage divider that translates varying resistance into a varying voltage.",
            scenario="A student connects an LDR directly between a 5V power pin and an Arduino analog input pin without any additional components. When tested under bright light and total darkness, the analog reading remains pegged at maximum (1023).",
        ),
        _mcq(
            "What underlying physical phenomenon causes an LDR's electrical resistance to drop when struck by visible light?",
            [
                "Photoconductivity: incident photons transfer energy to valence electrons, generating free electron-hole pairs that increase electrical conductivity.",
                "Thermal expansion causing internal metallic contacts to compress.",
                "Electromagnetic induction producing an opposite magnetic flux.",
                "Piezoelectric resonance exciting acoustic vibrations in the crystal.",
            ], "A",
            "LDRs are made of semiconductor materials like cadmium sulfide (CdS). Incident light photons liberate charge carriers through the photoelectric effect / photoconductivity, lowering electrical resistance.",
        ),
        _tf(
            "As ambient light intensity falling on a Light Dependent Resistor (LDR) increases, its internal electrical resistance increases proportionally.", "B",
            "An LDR exhibits a negative photo-conductive characteristic: its resistance decreases significantly as ambient light intensity increases.",
        ),
    ),
    _component(
        "pir", "PIR Motion Sensor",
        ["pir", "motion sensor", "passive infrared", "human detection", "motion", "infrared motion"],
        _mcq(
            "Which sensor module detects the movement of people and warm objects by sensing differential changes in ambient infrared radiation?",
            ["PIR Motion Sensor", "LDR Photoresistor", "Ultrasonic Distance Sensor", "Potentiometer"], "A",
            "A Passive Infrared (PIR) sensor measures infrared light radiating from objects in its field of view, detecting motion when thermal patterns change across its sensing elements.",
        ),
        _mcq(
            "A standard HC-SR501 PIR motion detector breakout module provides how many physical connection pins for interface?",
            ["2 pins", "3 pins (VCC, OUT, GND)", "4 pins", "6 pins"], "B",
            "A standard PIR motion sensor module has 3 physical connection pins: VCC (operating power), Digital OUT (high/low logic output), and GND (ground).",
        ),
        _mcq(
            "What is the most probable environmental cause for these false motion triggers?",
            [
                "Rapid thermal air currents from a nearby heating/cooling vent or direct sunlight crossing the sensor's optical field of view.",
                "High-frequency acoustic vibrations from desktop computer fans.",
                "Weak magnetic fields generated by fluorescent light ballasts.",
                "The ambient relative humidity dropping by 2%.",
            ], "A",
            "PIR sensors detect changes in infrared thermal radiation. Sudden drafts of warm air or sunlight heating the floor produce rapid temperature differentials that mimic the heat signature of a moving person.",
            scenario="A PIR motion sensor installed in a vacant indoor room repeatedly generates false motion alarms on sunny afternoons even though no people or animals enter the room.",
        ),
        _mcq(
            "Why is a faceted white Fresnel lens mounted over the pyroelectric sensor in a PIR module?",
            [
                "To segment the detection field of view into multiple zones and focus infrared radiation onto the pyroelectric detector elements.",
                "To amplify acoustic sound waves before they reach the circuit.",
                "To step down the incoming electrical voltage from 12V to 3.3V.",
                "To prevent visible light from leaving the sensor housing.",
            ], "A",
            "The Fresnel lens divides the wide viewing angle into distinct optical detection cones, allowing a moving thermal body to pass in and out of active zones to generate detectable differential voltage spikes.",
        ),
        _tf(
            "A Passive Infrared (PIR) motion sensor emits active infrared radiation beams into a room to detect moving objects.", "B",
            "PIR sensors are passive detectors; they do not emit radiation, but measure infrared energy radiated from warm moving bodies.",
        ),
    ),
    _component(
        "ssd1306_oled", "SSD1306 OLED Display (0.96 inch I2C)",
        ["oled", "ssd1306", "display", "screen", "i2c display", "graphic display"],
        _mcq(
            "Which display technology uses self-emissive organic light-emitting pixels operating over an I2C serial interface without requiring an external backlight?",
            ["SSD1306 OLED Display", "16x2 Parallel Character LCD", "Seven-Segment LED Display", "Cathode Ray Tube (CRT)"], "A",
            "The SSD1306 OLED display features self-illuminating organic pixels, providing high contrast, deep blacks, and low power consumption over a two-wire I2C interface.",
        ),
        _mcq(
            "An I2C-based 0.96-inch SSD1306 graphic OLED display module connects to a microcontroller using how many physical header pins?",
            ["2 pins", "4 pins (VCC, GND, SCL, SDA)", "6 pins", "8 pins"], "B",
            "A standard I2C OLED display breakout module has 4 pins: VCC (power), GND (ground), SCL (serial clock line), and SDA (serial data line).",
        ),
        _mcq(
            "Which hardware configuration issue is the most frequent cause of this communication stall?",
            [
                "Missing pull-up resistors on the I2C bus (SDA/SCL lines) or an incorrect device I2C hex address specified in code.",
                "The display pixels ran out of internal phosphor coating.",
                "The microcontroller clock speed is running too fast for direct current.",
                "The ground pin was connected to a shared circuit ground rail.",
            ], "A",
            "I2C is an open-drain bus protocol requiring pull-up resistors on SDA and SCL to maintain high idle states. If pull-ups are missing or the target address does not match (e.g. 0x3C vs 0x3D), communication will hang.",
            scenario="An I2C OLED display is wired to a microcontroller, but during initialization the program freezes and the display screen remains completely dark.",
        ),
        _mcq(
            "Why do OLED displays achieve dramatically higher contrast ratios than traditional LCD screens when rendering dark user interfaces?",
            [
                "Because black OLED pixels are turned completely off and emit zero light, whereas LCDs must continuously block an active backlight.",
                "Because OLED displays reflect ambient room light through optical microscopic mirrors.",
                "Because OLED screens run on high-voltage alternating current.",
                "Because OLED pixels absorb all incoming electrical noise.",
            ], "A",
            "OLED pixels are individually self-emissive. To display black, the corresponding OLED pixels are turned completely off, producing true zero-luminance blacks and infinite contrast.",
        ),
        _tf(
            "An I2C SSD1306 OLED display requires only two signal lines (SDA and SCL) in addition to power and ground for complete digital communication.", "A",
            "The I2C synchronous bus protocol uses only two bidirectional open-drain lines: Serial Data (SDA) and Serial Clock (SCL).",
        ),
    ),
    _component(
        "sg90_servo", "SG90 Micro Servo Motor",
        ["servo", "sg90", "motor", "actuator", "angular control", "pwm motor"],
        _mcq(
            "Which electromechanical actuator integrates a DC motor, reduction gearbox, and internal feedback potentiometer to provide precise angular output shaft positioning between 0 and 180 degrees?",
            ["SG90 Servo Motor", "Stepper Motor Driver", "Piezo Buzzer", "Relay Module"], "A",
            "The SG90 is a closed-loop micro servo motor that converts Pulse Width Modulation (PWM) signals into precise angular shaft positions.",
        ),
        _mcq(
            "How many wires make up the standard female connector plug of an SG90 micro servo motor?",
            ["2 wires", "3 wires (PWM Signal, VCC, GND)", "4 wires", "5 wires"], "B",
            "Standard hobby servos use 3 wires: PWM control signal (orange/yellow), VCC positive power (red), and GND ground (brown/black).",
        ),
        _mcq(
            "What mechanical condition is causing this excessive current draw and buzzing?",
            [
                "The command pulse width is driving the internal gear mechanism against its physical end-stop limiter, stalling the motor.",
                "The permanent magnets inside the motor have lost their magnetic field.",
                "The supply voltage dropped below zero volts.",
                "The feedback potentiometer disconnected from the circuit ground.",
            ], "A",
            "Stalling occurs when a PWM signal attempts to push the servo shaft past its internal mechanical limits, causing the DC motor to draw full stall current against the stationary stop.",
            scenario="When commanded to its maximum rotational angle, a servo motor buzzes loudly, heats up rapidly, and draws excessive current without turning any further.",
        ),
        _mcq(
            "How is the target angular shaft position encoded in the control signal of a standard hobby servo motor?",
            [
                "By the pulse width (duration) of a periodic PWM signal, typically between 1.0 ms (0°) and 2.0 ms (180°) repeated every 20 ms.",
                "By varying the continuous analog voltage linearly from 0V to 12V.",
                "By the frequency modulation of an ultrasonic sound wave.",
                "By counting the total continuous number of logic HIGH transitions.",
            ], "A",
            "Servo position is determined by the duration of the high pulse (typically 1.0 ms to 2.0 ms) within a 50 Hz (20 ms period) PWM signal.",
        ),
        _tf(
            "A standard positional SG90 micro servo motor rotates continuously in 360 degrees when fed standard 50Hz PWM control pulses.", "B",
            "Standard SG90 servos are closed-loop positional actuators restricted to a 0 to 180 degree rotation range corresponding to 1ms to 2ms pulse widths.",
        ),
    ),
    _component(
        "relay_module", "5V Single-Channel Relay Module",
        ["relay", "relay module", "switch high voltage", "electromechanical", "normally open", "com no nc"],
        _mcq(
            "Which electromechanical module allows a low-voltage 5V microcontroller logic signal to safely switch high-voltage or high-current electrical loads with complete galvanic isolation?",
            ["5V Relay Module", "Rotary Potentiometer", "Piezoelectric Buzzer", "LDR Light Sensor"], "A",
            "A relay module uses an electromagnetic coil to mechanically open or close electrical contacts, isolating the low-voltage microcontroller from high-voltage circuits.",
        ),
        _mcq(
            "On its low-voltage logic input header, how many pins does a standard 5V single-channel relay module possess?",
            ["2 pins", "3 pins (VCC, GND, IN)", "4 pins", "6 pins"], "B",
            "The low-voltage control header of a standard single-channel relay module consists of 3 pins: VCC (power), GND (ground), and IN (digital control trigger input).",
        ),
        _mcq(
            "Which protective component must be present across the inductive coil to eliminate these reset spikes?",
            [
                "A flyback (freewheeling) diode across the coil to clamp high-voltage inductive back-EMF spikes.",
                "A higher resistance pull-down resistor on the power bus.",
                "A step-up transformer connected to the digital trigger pin.",
                "A series electrolytic capacitor to block DC voltage.",
            ], "A",
            "When an inductive coil is de-energized, the collapsing magnetic field generates a massive reverse voltage spike (back-EMF). A flyback diode dissipates this energy safely, protecting the circuit.",
            scenario="A microcontroller randomly resets or halts every time its 5V relay de-energizes after controlling a high-voltage inductive solenoid valve.",
        ),
        _mcq(
            "On the load terminal block of a relay module, what is the functional difference between the Normally Open (NO) and Normally Closed (NC) contacts?",
            [
                "NO remains disconnected from Common (COM) until the relay coil is energized, while NC remains connected to COM when the relay is unpowered.",
                "NO is designed for direct current (DC), whereas NC is only rated for alternating current (AC).",
                "NO carries digital communication signals, while NC carries supply power.",
                "NO operates at 5V, while NC requires 240V.",
            ], "A",
            "The Normally Open (NO) terminal is open (disconnected) when the relay is off and closes when activated; the Normally Closed (NC) terminal is closed (connected) by default and opens when activated.",
        ),
        _tf(
            "An electromechanical relay module provides galvanic electrical isolation between low-voltage microcontroller logic and high-voltage AC loads.", "A",
            "Relays use magnetic coils to actuate mechanical switch contacts, providing physical electrical isolation between control and load circuits.",
        ),
    ),
    _component(
        "piezo_buzzer", "Piezo Buzzer (Active / Passive)",
        ["buzzer", "piezo", "acoustic alert", "tone", "audio", "sound alert"],
        _mcq(
            "Which acoustic component utilizes the inverse piezoelectric effect of a ceramic element to produce audible sound alerts, beeps, or musical tones?",
            ["Piezo Buzzer", "Relay Module", "Servo Motor", "Photoresistor"], "A",
            "A piezo buzzer uses piezoelectric ceramics that flex and vibrate when an electrical voltage is applied, generating acoustic sound waves.",
        ),
        _mcq(
            "A standard electronic piezoelectric buzzer element is built with how many physical electrical leads?",
            ["2 pins (Positive / Anode and Negative / Cathode)", "3 pins", "4 pins", "5 pins"], "A",
            "A standard piezo buzzer element has 2 connection pins: a positive terminal (longer lead) and a negative/ground terminal (shorter lead).",
        ),
        _mcq(
            "Why does the passive buzzer fail to emit a continuous audible sound under a constant DC HIGH signal?",
            [
                "Passive buzzers lack an internal oscillator and require an alternating AC square-wave frequency (PWM/tone) to vibrate continuously.",
                "The buzzer's polarity was permanently reversed by the DC voltage.",
                "The output current was clamped by an internal thermal fuse.",
                "Passive buzzers only generate sound in an acoustic vacuum chamber.",
            ], "A",
            "Unlike active buzzers which have built-in oscillating circuits, passive buzzers require an alternating square wave signal (such as Arduino tone()) to generate continuous sound vibrations.",
            scenario="A student connects a passive piezo buzzer to an Arduino digital output pin and sets the pin to continuous logic HIGH, but only hears a single faint click rather than a steady tone.",
        ),
        _mcq(
            "What is the primary operational difference between an Active Buzzer and a Passive Buzzer?",
            [
                "An active buzzer contains an internal oscillating circuit and produces sound from steady DC voltage, while a passive buzzer requires an external AC frequency signal.",
                "An active buzzer operates on AC mains voltage while a passive buzzer runs on 5V DC.",
                "An active buzzer emits light indicators while a passive buzzer emits sound.",
                "An active buzzer is a sensor while a passive buzzer is an actuator.",
            ], "A",
            "Active buzzers have an internal oscillator circuit that sounds automatically when supplied with DC power; passive buzzers have no internal oscillator and need an external frequency.",
        ),
        _tf(
            "A passive piezo buzzer will generate a continuous audible beep when connected directly to a steady DC voltage without an oscillating signal.", "B",
            "Passive buzzers lack an internal oscillator circuit and require an alternating AC square wave or PWM frequency to produce audible sound.",
        ),
    ),
    _component(
        "led_resistor", "Light Emitting Diode (LED) & Resistor",
        ["led", "light emitting diode", "resistor", "current limiting", "diode", "traffic light", "leds"],
        _mcq(
            "Which semiconductor component emits visible light when forward-biased and requires a current-limiting resistor to protect it from thermal burnout?",
            ["Light Emitting Diode (LED)", "Photoresistor (LDR)", "Piezoelectric Buzzer", "Bipolar Junction Transistor"], "A",
            "An LED is a semiconductor light source that emits light through electroluminescence when forward current flows across its p-n junction.",
        ),
        _mcq(
            "A standard single-color through-hole Light Emitting Diode (LED) has how many distinct physical connection leads?",
            ["2 pins (Anode / positive long lead and Cathode / negative short lead)", "3 pins", "4 pins", "5 pins"], "A",
            "A standard single-color through-hole LED has exactly 2 pins: the longer lead is the Anode (+) and the shorter lead with a flat edge is the Cathode (-).",
        ),
        _mcq(
            "What physical failure occurred within the LED?",
            [
                "Unconstrained forward current caused thermal runaway that destroyed the semiconductor p-n junction.",
                "The LED absorbed excess optical photons from the environment.",
                "The supply voltage reversed the internal crystal polarity of the LED.",
                "The LED's internal capacitor experienced dielectric breakdown.",
            ], "A",
            "LEDs have negligible internal resistance once their forward voltage threshold is exceeded. Without a current-limiting resistor, excessive current flows, instantly overheating and burning out the p-n junction.",
            scenario="A student connects a 5V digital output directly to an LED without placing a resistor in series. The LED flashes once with extreme brightness and then permanently stops working.",
        ),
        _mcq(
            "Why is a current-limiting resistor placed in series with an LED connected to a 5V microcontroller pin?",
            [
                "To safely drop the excess voltage and limit the forward current through the LED to a safe operating range (typically 10-20 mA).",
                "To increase the digital voltage from 5V to 50V for brighter illumination.",
                "To convert direct current (DC) into alternating current (AC).",
                "To invert the digital output logic state from HIGH to LOW.",
            ], "A",
            "The series resistor drops the voltage difference between the 5V supply and the LED forward voltage (e.g. 5V - 2V = 3V), limiting current according to Ohm's Law (I = V/R) to protect both the LED and microcontroller pin.",
        ),
        _tf(
            "Connecting an LED directly across a 5V power supply without a current-limiting series resistor can cause excessive current draw and destroy the LED.", "A",
            "LEDs are diodes with exponential current-voltage curves; without a series resistor to drop excess voltage, forward current exceeds safe limits.",
        ),
    ),
]


# ---------------------------------------------------------------------------
# Import-time integrity check (fail fast on a malformed bank)
# ---------------------------------------------------------------------------

def _validate_bank(components: Sequence[Dict[str, Any]]) -> None:
    seen_questions: Set[str] = set()
    for comp in components:
        for cat, entry in comp["questions"].items():
            opts = entry["options"]
            label = f"{comp['id']} / {cat}"
            if entry["answer"] not in opts:
                raise ValueError(f"Knowledge bank error: answer not in options ({label}).")
            if len(set(opts.values())) != len(opts):
                raise ValueError(f"Knowledge bank error: duplicate options ({label}).")
            if cat != CAT_TF and len(opts) != 4:
                raise ValueError(f"Knowledge bank error: MCQ must have 4 options ({label}).")
            if entry["question"] in seen_questions:
                raise ValueError(f"Knowledge bank error: duplicate question ({label}).")
            seen_questions.add(entry["question"])


_validate_bank(CURRICULUM_COMPONENTS)

# Precompiled keyword matchers, one per component (same order as the bank)
_COMPONENT_PATTERNS = [
    (comp, re.compile(r"\b(?:" + "|".join(re.escape(k) for k in comp["keywords"]) + r")\b"))
    for comp in CURRICULUM_COMPONENTS
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_components_in_text(text: str) -> List[Dict[str, Any]]:
    """Scan curriculum text and return matching components (bank order).
    Falls back to the first four components when nothing matches."""
    text_lower = str(text or "").lower()
    matched = [comp for comp, pattern in _COMPONENT_PATTERNS if pattern.search(text_lower)]
    return matched or CURRICULUM_COMPONENTS[:4]


def _to_item(entry: Dict[str, Any], category: str, q_type: str = "mcq") -> Dict[str, Any]:
    """Build a fresh output item (never exposes the shared bank objects)."""
    item: Dict[str, Any] = {
        "type": q_type,
        "question": entry["question"],
        "options": dict(entry["options"]),
        "answer": entry["answer"],
        "explanation": entry["explanation"],
        "category": category,
        "section": category,
        "marks": 1,
    }
    if entry.get("scenario"):
        item["scenario"] = entry["scenario"]
    return item


def _pick(
    components: Sequence[Dict[str, Any]],
    category: str,
    seen: Set[str],
    limit: int,
    q_type: str = "mcq",
    start_index: int = 0,
) -> List[Dict[str, Any]]:
    """Pick up to `limit` unseen questions of `category`, cycling through components starting at `start_index`."""
    if not components or limit <= 0:
        return []
    picked: List[Dict[str, Any]] = []
    n = len(components)
    for i in range(n):
        if len(picked) >= limit:
            break
        comp = components[(start_index + i) % n]
        entry = comp["questions"].get(category)
        if entry and entry["question"] not in seen:
            seen.add(entry["question"])
            picked.append(_to_item(entry, category, q_type))
    return picked


def _mixed_paper(components: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """10 questions: 5 MCQs (3 standard + 2 scenario) followed by 5 True/False."""
    if not components:
        return []
    seen: Set[str] = set()

    standard: List[Dict[str, Any]] = []
    comp_idx = 0
    for cat in STANDARD_MIXED_CATEGORIES:
        picked = _pick(components, cat, seen, limit=1, start_index=comp_idx)
        if picked:
            standard.extend(picked)
            comp_idx += 1
        if len(standard) >= 3:
            break

    scenario = _pick(components, CAT_SCENARIO, seen, limit=2, start_index=comp_idx)
    comp_idx += len(scenario)

    true_false = _pick(components, CAT_TF, seen, limit=5, q_type="true_false", start_index=comp_idx)

    # Interleave: std, std, scenario, std, scenario
    order = [
        standard[0:1], standard[1:2], scenario[0:1], standard[2:3], scenario[1:2],
    ]
    mcqs = [q for group in order for q in group]
    for q in standard + scenario:            # backfill if any slot was short
        if q not in mcqs and len(mcqs) < 5:
            mcqs.append(q)

    return (mcqs[:5] + true_false[:5])[:10]


def get_curriculum_component_questions(
    content: str,
    target_count: int = 10,
    assessment_type: str = "merged_conceptual",
    needed_categories: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate balanced, factually validated questions from components found in `content`.

    Special modes:
    - "mixed": exactly 10 questions (5 MCQs incl. 2 scenario-based + 5 True/False).
    - "true_false": conceptual True/False questions up to `target_count`.
    Otherwise questions are drawn round-robin across the requested categories.
    """
    target_count = max(0, int(target_count or 0))
    a_type = str(assessment_type or "").strip().lower()

    matched = detect_components_in_text(content)
    matched_ids = {c["id"] for c in matched}
    components = matched + [c for c in CURRICULUM_COMPONENTS if c["id"] not in matched_ids]

    if a_type == "mixed":
        return _mixed_paper(components)

    if a_type == "true_false":
        return _pick(components, CAT_TF, set(), limit=target_count, q_type="true_false")

    categories = list(needed_categories) if needed_categories else list(CORE_CATEGORIES)
    selected: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    comp_idx = 0

    # Round-robin: one new question per category per pass until full or exhausted
    while len(selected) < target_count:
        progressed = False
        for cat in categories:
            if len(selected) >= target_count:
                break
            picked = _pick(components, cat, seen, limit=1, start_index=comp_idx)
            if picked:
                selected.extend(picked)
                comp_idx += 1
                progressed = True
        if not progressed:
            break

    return selected[:target_count]