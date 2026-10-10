FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/productivist-backend-*.jar app.jar
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
# Railway's private network is IPv6; "::" is dual-stack on Linux, so IPv4 clients still connect.
ENV SERVER_ADDRESS="::"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
