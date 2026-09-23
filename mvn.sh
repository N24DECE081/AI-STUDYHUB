#!/bin/bash
# Maven wrapper — dùng straight java + plexus classpath (tránh MSYS path conversion bug)
MAVEN_HOME="${MAVEN_HOME:-$HOME/AI-STUDYHUB/apache-maven-3.9.6}"
exec java \
  -cp "$MAVEN_HOME/boot/plexus-classworlds-2.7.0.jar" \
  -Dclassworlds.conf="$MAVEN_HOME/bin/m2.conf" \
  -Dmaven.home="$MAVEN_HOME" \
  -Dmaven.multiModuleProjectDirectory="$PWD" \
  org.codehaus.plexus.classworlds.launcher.Launcher "$@"
