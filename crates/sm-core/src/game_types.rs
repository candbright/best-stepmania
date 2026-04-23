use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum StepsType {
    // Dance (DDR-style)
    DanceSingle,
    DanceDouble,
    DanceSolo,
    DanceCouple,
    DanceRoutine,
    DanceThreepanel,

    // Pump (PIU-style)
    PumpSingle,
    PumpHalfdouble,
    PumpDouble,
    PumpCouple,
    PumpRoutine,
}

impl StepsType {
    pub fn num_columns(self) -> usize {
        match self {
            Self::DanceThreepanel => 3,
            Self::DanceSingle => 4,
            Self::PumpSingle | Self::PumpHalfdouble => 5,
            Self::DanceSolo => 6,
            Self::DanceDouble | Self::DanceCouple | Self::DanceRoutine => 8,
            Self::PumpDouble | Self::PumpCouple | Self::PumpRoutine => 10,
        }
    }

    pub fn is_pump(self) -> bool {
        matches!(
            self,
            Self::PumpSingle
                | Self::PumpHalfdouble
                | Self::PumpDouble
                | Self::PumpCouple
                | Self::PumpRoutine
        )
    }

    pub fn is_dance(self) -> bool {
        matches!(
            self,
            Self::DanceSingle
                | Self::DanceDouble
                | Self::DanceSolo
                | Self::DanceCouple
                | Self::DanceRoutine
                | Self::DanceThreepanel
        )
    }

    pub fn category(self) -> StepsTypeCategory {
        match self {
            Self::DanceSingle
            | Self::DanceThreepanel
            | Self::DanceSolo
            | Self::PumpSingle
            | Self::PumpHalfdouble => StepsTypeCategory::Single,
            Self::DanceDouble | Self::PumpDouble => StepsTypeCategory::Double,
            Self::DanceCouple | Self::PumpCouple => StepsTypeCategory::Couple,
            Self::DanceRoutine | Self::PumpRoutine => StepsTypeCategory::Routine,
        }
    }

    pub fn from_str_tag(s: &str) -> Option<Self> {
        match s.to_lowercase().replace('-', "_").as_str() {
            // Dance (DDR) types
            "dance_single" => Some(Self::DanceSingle),
            "dance_double" => Some(Self::DanceDouble),
            "dance_solo" => Some(Self::DanceSolo),
            "dance_couple" => Some(Self::DanceCouple),
            "dance_routine" => Some(Self::DanceRoutine),
            "dance_threepanel" => Some(Self::DanceThreepanel),

            // Pump (PIU) types
            "pump_single" => Some(Self::PumpSingle),
            "pump_halfdouble" | "pump_half_double" => Some(Self::PumpHalfdouble),
            "pump_double" => Some(Self::PumpDouble),
            "pump_couple" => Some(Self::PumpCouple),
            "pump_routine" => Some(Self::PumpRoutine),

            _ => None,
        }
    }
}

impl fmt::Display for StepsType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::DanceSingle => "dance-single",
            Self::DanceDouble => "dance-double",
            Self::DanceSolo => "dance-solo",
            Self::DanceCouple => "dance-couple",
            Self::DanceRoutine => "dance-routine",
            Self::DanceThreepanel => "dance-threepanel",
            Self::PumpSingle => "pump-single",
            Self::PumpHalfdouble => "pump-halfdouble",
            Self::PumpDouble => "pump-double",
            Self::PumpCouple => "pump-couple",
            Self::PumpRoutine => "pump-routine",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum StepsTypeCategory {
    Single,
    Double,
    Couple,
    Routine,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PlayMode {
    Regular,
    Nonstop,
    Oni,
    Endless,
    Battle,
    Rave,
}
