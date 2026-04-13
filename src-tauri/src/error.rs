use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "code", content = "detail")]
pub enum AppError {
    #[serde(rename = "not_found")]
    NotFound(String),
    #[serde(rename = "parse_error")]
    ParseError(String),
    #[serde(rename = "io_error")]
    IoError(String),
    #[serde(rename = "invalid_arg")]
    InvalidArg(String),
    #[serde(rename = "internal")]
    Internal(String),
}

impl AppError {
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }
    pub fn parse(msg: impl Into<String>) -> Self {
        Self::ParseError(msg.into())
    }
    pub fn io(msg: impl Into<String>) -> Self {
        Self::IoError(msg.into())
    }
    pub fn invalid(msg: impl Into<String>) -> Self {
        Self::InvalidArg(msg.into())
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(s) => write!(f, "not_found: {s}"),
            Self::ParseError(s) => write!(f, "parse_error: {s}"),
            Self::IoError(s) => write!(f, "io_error: {s}"),
            Self::InvalidArg(s) => write!(f, "invalid_arg: {s}"),
            Self::Internal(s) => write!(f, "internal: {s}"),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::IoError(e.to_string())
    }
}

impl From<toml::de::Error> for AppError {
    fn from(e: toml::de::Error) -> Self {
        Self::ParseError(e.to_string())
    }
}

impl From<toml::ser::Error> for AppError {
    fn from(e: toml::ser::Error) -> Self {
        Self::ParseError(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::ParseError(e.to_string())
    }
}
