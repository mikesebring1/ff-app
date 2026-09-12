# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    requests \
    boto3

# Copy application code
COPY infra/fargate/polling-service/polling_service.py .
COPY infra/layers/common-utils/python/ff_utils /app/ff_utils
# Install local ff-standings package
COPY packages/ff-standings /tmp/ff-standings
RUN pip install --no-cache-dir /tmp/ff-standings

# Make the script executable
RUN chmod +x polling_service.py

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash app
USER app

# Run the polling service
CMD ["python3", "polling_service.py"]
