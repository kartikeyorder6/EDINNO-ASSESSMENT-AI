from services.ai_generator import generate_assessment


chapter_content = """
Arduino Uno is a microcontroller board.
It has 14 digital input/output pins and 6 analog input pins.
It commonly operates at 5V.
It can be used to control LEDs, sensors, motors, and other electronic components.
"""

assessment_type = "mcq"

result = generate_assessment(
    chapter_content,
    assessment_type
)

print("AI RESULT:")
print(result)