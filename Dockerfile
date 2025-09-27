# Use the official PostgreSQL 15 image as the base
FROM postgres:15

# Set environment variables
ENV POSTGRES_USER=yourself
ENV POSTGRES_PASSWORD=secretPassword
ENV POSTGRES_DB=financebook

# Create a volume for persistent data
VOLUME database

# Expose the default PostgreSQL port
EXPOSE 5432